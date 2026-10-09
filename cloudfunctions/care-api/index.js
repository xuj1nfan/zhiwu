const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event = {}) => {
  const { OPENID: openid } = cloud.getWXContext();
  if (!openid) {
    throw new Error("Authenticated WeChat user is required.");
  }

  const db = cloud.database();

  async function ownedPlant(plantId) {
    if (typeof plantId !== "string" || !plantId) {
      throw new Error("A plant id is required.");
    }
    const result = await db.collection("plants").doc(plantId).get();
    if (!result.data || result.data.ownerOpenid !== openid) {
      throw new Error("Plant not found.");
    }
    return result.data;
  }

  async function ownedTask(taskId) {
    if (typeof taskId !== "string" || !taskId) {
      throw new Error("A task id is required.");
    }
    const result = await db.collection("care_tasks").doc(taskId).get();
    if (!result.data || result.data.ownerOpenid !== openid) {
      throw new Error("Task not found.");
    }
    return result.data;
  }

  switch (event.action) {
    case "health":
      return { ok: true };
    case "plants.list": {
      const result = await db
        .collection("plants")
        .where({ ownerOpenid: openid })
        .get();
      return { plants: result.data };
    }
    case "plants.create": {
      const name = typeof event.name === "string" ? event.name.trim() : "";
      const species = typeof event.species === "string" ? event.species.trim() : "";
      if (!name || name.length > 60) {
        throw new Error("Plant name must contain 1 to 60 characters.");
      }
      if (species.length > 100) {
        throw new Error("Plant species must be at most 100 characters.");
      }

      const now = db.serverDate();
      const result = await db.collection("plants").add({
        data: {
          ownerOpenid: openid,
          name,
          species,
          createdAt: now,
          updatedAt: now,
        },
      });
      return { id: result._id, name, species };
    }
    case "plants.update": {
      const plantId = event.id;
      await ownedPlant(plantId);
      const name = typeof event.name === "string" ? event.name.trim() : "";
      const species = typeof event.species === "string" ? event.species.trim() : "";
      if (!name || name.length > 60) {
        throw new Error("Plant name must contain 1 to 60 characters.");
      }
      if (species.length > 100) {
        throw new Error("Plant species must be at most 100 characters.");
      }

      await db.collection("plants").doc(plantId).update({
        data: { name, species, updatedAt: db.serverDate() },
      });
      await db.collection("care_tasks").where({ ownerOpenid: openid, plantId, status: "pending" }).update({
        data: { plantName: name, updatedAt: db.serverDate() },
      });
      return { id: plantId, name, species };
    }
    case "plants.delete": {
      const plantId = event.id;
      await ownedPlant(plantId);
      const now = db.serverDate();
      await db.collection("care_tasks").where({
        ownerOpenid: openid,
        plantId,
        status: "pending",
      }).update({ data: { status: "cancelled", updatedAt: now } });
      await db.collection("care_events").where({ ownerOpenid: openid, plantId }).remove();
      await db.collection("plants").doc(plantId).remove();
      return { id: plantId, deleted: true };
    }
    case "tasks.list": {
      const result = await db.collection("care_tasks")
        .where({ ownerOpenid: openid, status: "pending" })
        .orderBy("dueAt", "asc")
        .limit(100)
        .get();
      return { tasks: result.data };
    }
    case "tasks.create": {
      const plantId = event.plantId;
      const plant = await ownedPlant(plantId);
      const allowedKinds = ["water", "fertilize", "check"];
      const kind = event.kind;
      if (!allowedKinds.includes(kind)) {
        throw new Error("Unsupported care task type.");
      }
      const dueAt = new Date(event.dueAt);
      if (!Number.isFinite(dueAt.getTime())) {
        throw new Error("A valid reminder date is required.");
      }
      const note = typeof event.note === "string" ? event.note.trim() : "";
      if (note.length > 200) {
        throw new Error("Task note must be at most 200 characters.");
      }

      const now = db.serverDate();
      const result = await db.collection("care_tasks").add({
        data: {
          ownerOpenid: openid,
          plantId,
          plantName: plant.name,
          kind,
          dueAt,
          note,
          status: "pending",
          createdAt: now,
          updatedAt: now,
        },
      });
      return { id: result._id };
    }
    case "tasks.complete": {
      const taskId = event.id;
      const task = await ownedTask(taskId);
      if (task.status !== "pending") {
        throw new Error("This task is no longer pending.");
      }
      const now = db.serverDate();
      const update = await db.collection("care_tasks").doc(taskId).update({
        data: { status: "completed", completedAt: now, updatedAt: now },
      });
      if (update.stats && update.stats.updated === 0) {
        throw new Error("This task was already updated.");
      }
      await db.collection("care_events").add({
        data: {
          ownerOpenid: openid,
          plantId: task.plantId,
          taskId,
          kind: task.kind,
          note: task.note || "",
          completedAt: now,
          createdAt: now,
        },
      });
      return { id: taskId, completed: true };
    }
    case "tasks.postpone": {
      const taskId = event.id;
      const task = await ownedTask(taskId);
      if (task.status !== "pending") {
        throw new Error("This task is no longer pending.");
      }
      const dueAt = new Date(task.dueAt);
      dueAt.setDate(dueAt.getDate() + 1);
      await db.collection("care_tasks").doc(taskId).update({
        data: { dueAt, updatedAt: db.serverDate() },
      });
      return { id: taskId, dueAt };
    }
    default:
      throw new Error("Unsupported care-api action.");
  }
};
