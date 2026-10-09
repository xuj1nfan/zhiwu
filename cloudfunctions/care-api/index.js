const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const PET_STATUSES = ["toxic", "non_toxic", "unknown"];
const TASK_KINDS = ["water", "fertilize", "check"];
const EVENT_KINDS = ["water", "fertilize", "check", "observation", "milestone", "repot"];
const PET_CATALOG = {
  "Epipremnum aureum": { source: "https://www.aspca.org/pet-care/aspca-poison-control/toxic-and-non-toxic-plants/golden-pothos", cat: "toxic", dog: "toxic" },
  "Chlorophytum comosum": { source: "https://www.aspca.org/pet-care/aspca-poison-control/toxic-and-non-toxic-plants/spider-plant", cat: "non_toxic", dog: "non_toxic" },
  "Chamaedorea elegans": { source: "https://www.aspca.org/pet-care/aspca-poison-control/toxic-and-non-toxic-plants/parlor-palm", cat: "non_toxic", dog: "non_toxic" },
  "Lilium lancifolium": { source: "https://www.aspca.org/pet-care/aspca-poison-control/toxic-and-non-toxic-plants/tiger-lily", cat: "toxic", dog: "non_toxic" },
};

function text(value, max = 200) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function validDate(value, label) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`${label} is invalid.`);
  return date;
}

exports.main = async (event = {}) => {
  const { OPENID: openid } = cloud.getWXContext();
  if (!openid) throw new Error("Authenticated WeChat user is required.");
  const db = cloud.database();

  async function ownedPlant(id, transaction = db) {
    if (typeof id !== "string" || !id) throw new Error("A plant id is required.");
    const result = await transaction.collection("plants").doc(id).get();
    if (!result.data || result.data.ownerOpenid !== openid) throw new Error("Plant not found.");
    return result.data;
  }
  async function ownedTask(id, transaction = db) {
    if (typeof id !== "string" || !id) throw new Error("A task id is required.");
    const result = await transaction.collection("care_tasks").doc(id).get();
    if (!result.data || result.data.ownerOpenid !== openid) throw new Error("Task not found.");
    return result.data;
  }
  async function ownedEvent(id, transaction = db) {
    if (typeof id !== "string" || !id) throw new Error("An event id is required.");
    const result = await transaction.collection("care_events").doc(id).get();
    if (!result.data || result.data.ownerOpenid !== openid) throw new Error("Care record not found.");
    return result.data;
  }
  async function atomic(callback) {
    if (typeof db.runTransaction === "function") return db.runTransaction(callback);
    return callback(db);
  }

  switch (event.action) {
    case "health": return { ok: true };
    case "fertilizer.calculate": {
      const rate = Number(event.rate);
      const volume = Number(event.volume);
      const rateUnit = event.rateUnit === "ml_per_l" ? "ml_per_l" : event.rateUnit === "g_per_l" ? "g_per_l" : "";
      if (!rateUnit || !Number.isFinite(rate) || rate <= 0 || !Number.isFinite(volume) || volume <= 0) throw new Error("标签剂量和水量必须为正数。");
      return { amount: rate * volume / 1000, amountUnit: rateUnit === "g_per_l" ? "g" : "ml", rate, volume, rateUnit };
    }
    case "plants.list": {
      const result = await db.collection("plants").where({ ownerOpenid: openid }).orderBy("updatedAt", "desc").limit(100).get();
      return { plants: result.data.map((plant) => ({ ...plant, petSummary: plant.petSummary || { cat: "unknown", dog: "unknown" }, petPreference: plant.petPreference || "none" })) };
    }
    case "plants.get": {
      const plant = await ownedPlant(event.id);
      const events = await db.collection("care_events").where({ ownerOpenid: openid, plantId: event.id }).orderBy("occurredAt", "desc").limit(200).get();
      const tasks = await db.collection("care_tasks").where({ ownerOpenid: openid, plantId: event.id, status: "pending" }).orderBy("dueAt", "asc").limit(100).get();
      const photos = await db.collection("plant_photos").where({ ownerOpenid: openid, plantId: event.id, deleted: false }).orderBy("occurredAt", "desc").limit(100).get().catch(() => ({ data: [] }));
      return { plant: { ...plant, petSummary: plant.petSummary || { cat: "unknown", dog: "unknown" }, petPreference: plant.petPreference || "none" }, events: events.data.filter((item) => !item.deleted), tasks: tasks.data, photos: photos.data };
    }
    case "plants.create":
    case "plants.update": {
      const name = text(event.name, 60);
      const species = text(event.species, 120);
      if (!name) throw new Error("Plant name must contain 1 to 60 characters.");
      const updates = {
        name, species, location: text(event.location, 60), lightLevel: text(event.lightLevel, 30),
        potDiameter: Number.isFinite(Number(event.potDiameter)) && Number(event.potDiameter) > 0 ? Number(event.potDiameter) : null,
        drainage: event.drainage === true ? true : event.drainage === false ? false : null,
        substrate: text(event.substrate, 200), growthStage: text(event.growthStage, 40),
        purchaseDate: event.purchaseDate ? validDate(event.purchaseDate, "Purchase date") : null, updatedAt: db.serverDate(),
      };
      if (event.action === "plants.create") {
        const now = db.serverDate();
        const result = await db.collection("plants").add({ data: { ownerOpenid: openid, ...updates, createdAt: now, petSummary: { cat: "unknown", dog: "unknown" }, petPreference: "none" } });
        return { id: result._id };
      }
      const old = await ownedPlant(event.id);
      if (species !== (old.species || "")) Object.assign(updates, { petSummary: { cat: "unknown", dog: "unknown" }, petSource: "", petCheckedAt: null });
      await db.collection("plants").doc(event.id).update({ data: updates });
      await db.collection("care_tasks").where({ ownerOpenid: openid, plantId: event.id, status: "pending" }).update({ data: { plantName: name, updatedAt: db.serverDate() } });
      return { id: event.id };
    }
    case "plants.setPetPreference": {
      await ownedPlant(event.id);
      const preference = ["none", "cat", "dog", "both"].includes(event.preference) ? event.preference : "none";
      await db.collection("plants").doc(event.id).update({ data: { petPreference: preference, updatedAt: db.serverDate() } });
      return { id: event.id, preference };
    }
    case "plants.confirmSpecies": {
      await ownedPlant(event.id);
      const species = text(event.scientificName, 120);
      if (!species) throw new Error("A confirmed scientific name is required.");
      const catalog = PET_CATALOG[species];
      if (!catalog) throw new Error("This species has no verified pet record yet.");
      const cat = catalog.cat;
      const dog = catalog.dog;
      const checkedAt = validDate(event.checkedAt || new Date(), "Checked date");
      await db.collection("plants").doc(event.id).update({ data: { species, petSummary: { cat, dog }, petSource: catalog.source, petCheckedAt: checkedAt, petNote: text(event.note, 300), updatedAt: db.serverDate() } });
      return { id: event.id, species, cat, dog };
    }
    case "plants.delete": {
      await ownedPlant(event.id);
      const now = db.serverDate();
      await db.collection("care_tasks").where({ ownerOpenid: openid, plantId: event.id, status: "pending" }).update({ data: { status: "cancelled", cancelledAt: now, updatedAt: now } });
      await db.collection("care_events").where({ ownerOpenid: openid, plantId: event.id }).remove();
      await db.collection("plants").doc(event.id).remove();
      return { id: event.id, deleted: true };
    }
    case "plants.archive":
    case "plants.restore": {
      await ownedPlant(event.id);
      const archived = event.action === "plants.archive";
      if (archived) await db.collection("care_tasks").where({ ownerOpenid: openid, plantId: event.id, status: "pending" }).update({ data: { status: "cancelled", cancelReason: "plant-archived", updatedAt: db.serverDate() } });
      await db.collection("plants").doc(event.id).update({ data: { archived, updatedAt: db.serverDate() } });
      return { id: event.id, archived };
    }

    case "tasks.list": {
      const result = await db.collection("care_tasks").where({ ownerOpenid: openid, status: "pending" }).orderBy("dueAt", "asc").limit(200).get();
      return { tasks: result.data };
    }
    case "tasks.completedList": {
      const result = await db.collection("care_tasks").where({ ownerOpenid: openid, status: "completed" }).orderBy("completedAt", "desc").limit(30).get();
      return { tasks: result.data };
    }
    case "tasks.create": {
      const plant = await ownedPlant(event.plantId);
      if (!TASK_KINDS.includes(event.kind)) throw new Error("Unsupported care task type.");
      const dueAt = validDate(event.dueAt, "Task date");
      const result = await db.collection("care_tasks").add({ data: { ownerOpenid: openid, plantId: event.plantId, plantName: plant.name, kind: event.kind, dueAt, note: text(event.note), status: "pending", source: event.source === "care_event" ? "care_event" : "manual", sourceEventId: text(event.sourceEventId, 80), createdAt: db.serverDate(), updatedAt: db.serverDate() } });
      return { id: result._id };
    }
    case "tasks.update": {
      const task = await ownedTask(event.id);
      if (task.status !== "pending") throw new Error("Only pending tasks can be edited.");
      if (!TASK_KINDS.includes(event.kind)) throw new Error("Unsupported care task type.");
      await db.collection("care_tasks").doc(event.id).update({ data: { dueAt: validDate(event.dueAt, "Task date"), kind: event.kind, note: text(event.note), userAdjusted: true, updatedAt: db.serverDate() } });
      return { id: event.id, updated: true };
    }
    case "tasks.cancel": {
      const task = await ownedTask(event.id);
      if (task.status !== "pending") throw new Error("This task is no longer pending.");
      await db.collection("care_tasks").doc(event.id).update({ data: { status: "cancelled", cancelledAt: db.serverDate(), cancelReason: "user", updatedAt: db.serverDate() } });
      return { id: event.id, cancelled: true };
    }
    case "tasks.complete": {
      const taskId = event.id;
      await atomic(async (transaction) => {
        const task = await ownedTask(taskId, transaction);
        if (task.status !== "pending") throw new Error("This task is no longer pending.");
        const now = db.serverDate();
        await transaction.collection("care_tasks").doc(taskId).update({ data: { status: "completed", completedAt: now, updatedAt: now } });
        const eventId = `${taskId}_complete`;
        const existing = await transaction.collection("care_events").doc(eventId).get().catch(() => ({ data: null }));
        if (!existing.data || existing.data.deleted) await transaction.collection("care_events").doc(eventId).set({ data: { ownerOpenid: openid, plantId: task.plantId, taskId, kind: task.kind, note: task.note || "", occurredAt: now, recordedAt: now, sourceAction: "task-complete", deleted: false } });
      });
      return { id: taskId, completed: true };
    }
    case "tasks.undo": {
      const task = await ownedTask(event.id);
      if (task.status !== "completed") throw new Error("Only completed tasks can be undone.");
      await atomic(async (transaction) => {
        await transaction.collection("care_tasks").doc(event.id).update({ data: { status: "pending", completedAt: null, updatedAt: db.serverDate() } });
        const record = await transaction.collection("care_events").doc(`${event.id}_complete`).get().catch(() => ({ data: null }));
        if (record.data) await transaction.collection("care_events").doc(`${event.id}_complete`).update({ data: { undoneAt: db.serverDate(), deleted: true } });
      });
      return { id: event.id, undone: true };
    }
    case "tasks.postpone": {
      const task = await ownedTask(event.id);
      if (task.status !== "pending") throw new Error("This task is no longer pending.");
      const choice = event.choice || "tomorrow";
      const old = new Date(task.dueAt);
      const now = new Date();
      let dueAt;
      if (choice === "tomorrow") dueAt = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, old.getHours(), old.getMinutes());
      else if (choice === "three_days") dueAt = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3, old.getHours(), old.getMinutes());
      else dueAt = validDate(event.dueAt, "Postponed date");
      await db.collection("care_tasks").doc(event.id).update({ data: { dueAt, postponedAt: db.serverDate(), postponeChoice: choice, updatedAt: db.serverDate() } });
      return { id: event.id, dueAt };
    }

    case "events.list": {
      await ownedPlant(event.plantId);
      const query = { ownerOpenid: openid, plantId: event.plantId };
      if (EVENT_KINDS.includes(event.kind)) query.kind = event.kind;
      const result = await db.collection("care_events").where(query).orderBy("occurredAt", "desc").limit(200).get();
      return { events: result.data.filter((item) => !item.deleted) };
    }
    case "events.create": {
      const plant = await ownedPlant(event.plantId);
      if (!EVENT_KINDS.includes(event.kind)) throw new Error("Unsupported care record type.");
      const eventData = { ownerOpenid: openid, plantId: plant._id, kind: event.kind, occurredAt: validDate(event.occurredAt, "Occurred time"), recordedAt: db.serverDate(), note: text(event.note), observationStatus: ["wet", "moderate", "dry", "unknown"].includes(event.observationStatus) ? event.observationStatus : "unknown", amount: event.amount == null || event.amount === "" ? null : Number(event.amount), amountUnit: text(event.amountUnit, 20), sourceAction: "direct" };
      if (eventData.amount !== null && (!Number.isFinite(eventData.amount) || eventData.amount < 0)) throw new Error("Amount is invalid.");
      let completedTaskId = "";
      await atomic(async (transaction) => {
        if (event.completeTaskId) {
          const task = await ownedTask(event.completeTaskId, transaction);
          if (task.status !== "pending" || task.plantId !== plant._id || task.kind !== event.kind) throw new Error("The selected task no longer matches this record.");
          await transaction.collection("care_tasks").doc(event.completeTaskId).update({ data: { status: "completed", completedAt: eventData.occurredAt, updatedAt: db.serverDate() } });
          eventData.taskId = event.completeTaskId;
          completedTaskId = event.completeTaskId;
        }
        const requestId = text(event.requestId, 80);
        if (requestId) await transaction.collection("care_events").doc(`${openid}_${requestId}`).set({ data: eventData });
        else await transaction.collection("care_events").add({ data: eventData });
      });
      return { completedTaskId };
    }
    case "events.update": {
      await ownedEvent(event.id);
      const amount = event.amount == null || event.amount === "" ? null : Number(event.amount);
      if (amount !== null && (!Number.isFinite(amount) || amount < 0)) throw new Error("Amount is invalid.");
      await db.collection("care_events").doc(event.id).update({ data: { occurredAt: validDate(event.occurredAt, "Occurred time"), note: text(event.note), observationStatus: ["wet", "moderate", "dry", "unknown"].includes(event.observationStatus) ? event.observationStatus : "unknown", amount, amountUnit: text(event.amountUnit, 20), updatedAt: db.serverDate() } });
      return { id: event.id, updated: true };
    }
    case "events.delete": {
      await ownedEvent(event.id);
      await db.collection("care_events").doc(event.id).update({ data: { deleted: true, deletedAt: db.serverDate() } });
      return { id: event.id, deleted: true };
    }
    case "photos.add": {
      await ownedPlant(event.plantId);
      const fileId = text(event.fileId, 500);
      if (!fileId || !/^cloud:\/\//.test(fileId)) throw new Error("A valid uploaded image is required.");
      const result = await db.collection("plant_photos").add({ data: { ownerOpenid: openid, plantId: event.plantId, fileId, occurredAt: validDate(event.occurredAt || new Date(), "Photo date"), recordedAt: db.serverDate(), note: text(event.note), deleted: false } });
      return { id: result._id, fileId };
    }
    case "photos.delete": {
      const result = await db.collection("plant_photos").doc(event.id).get();
      if (!result.data || result.data.ownerOpenid !== openid) throw new Error("Photo not found.");
      await db.collection("plant_photos").doc(event.id).update({ data: { deleted: true, deletedAt: db.serverDate() } });
      if (result.data.fileId && typeof cloud.deleteFile === "function") await cloud.deleteFile({ fileList: [result.data.fileId] }).catch((error) => console.warn("Photo file cleanup failed", error));
      return { id: event.id, deleted: true };
    }
    default: throw new Error("Unsupported care-api action.");
  }
};
