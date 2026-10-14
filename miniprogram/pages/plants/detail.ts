type PetStatus = "toxic" | "non_toxic" | "unknown";
type EventKind = "water" | "fertilize" | "check" | "observation" | "milestone" | "repot";
type Plant = { _id: string; name: string; species: string; petSummary?: { cat: PetStatus; dog: PetStatus }; petPreference?: string; petSource?: string; petCheckedAt?: string | Date; petNote?: string };
type CareSpecies = { id: string; name_zh: string; botanical_profile?: string; taxonomy?: { scientific_name?: string }; environment_thresholds?: { ideal_temp_min_c?: number; ideal_temp_max_c?: number; humidity_min_pct?: number; humidity_max_pct?: number } };
type CareRule = { _id: string; stage_code: string; stage_name: string; season_window?: string; light?: { description?: string }; water_and_humidity?: { trigger_rule?: string; description?: string }; fertilizer?: { description?: string }; pot_and_substrate?: { pot_type?: string; substrate?: string; repot_and_prune_note?: string } };
type PendingTask = { _id: string; kind: EventKind; dueAt: string | Date };
type PlantPhoto = { _id: string; fileId: string; occurredAt: string | Date; note: string };
type CareEvent = { _id: string; kind: EventKind; occurredAt: string | Date; note: string; observationStatus?: string; amount?: number | null; amountUnit?: string; taskId?: string };
const DETAIL_KIND_LABELS: Record<EventKind, string> = { water: "浇水", fertilize: "施肥", check: "检查", observation: "观察", milestone: "里程碑", repot: "换盆" };
const STATUS_LABELS: Record<PetStatus, string> = { toxic: "有毒性记录", non_toxic: "资料列为无毒", unknown: "资料未确认" };
function localDateTime(value: string | Date) { const d = new Date(value); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; }

Page({
  data: { id: "", plant: null as Plant | null, careSpecies: null as CareSpecies | null, careRules: [] as CareRule[], showCareDetails: false, events: [] as CareEvent[], visibleEvents: [] as CareEvent[], photos: [] as PlantPhoto[], comparePhotos: [] as PlantPhoto[], photoDate: localDateTime(new Date()).slice(0, 10), photoNote: "", pendingTasks: [] as PendingTask[], taskNames: ["不关联待办"], selectedTaskIndex: 0, editingEventId: "", filter: "all", filterLabels: ["全部", "浇水", "施肥", "检查", "观察", "里程碑", "换盆"], loading: false, saving: false, eventKindIndex: 0, eventKinds: ["浇水", "施肥", "检查", "观察", "里程碑", "换盆"], eventKindValues: ["water", "fertilize", "check", "observation", "milestone", "repot"] as EventKind[], observationStatuses: ["仍湿", "适中", "偏干", "无法判断"], observationStatusValues: ["wet", "moderate", "dry", "unknown"], observationStatusIndex: 3, occurredDate: localDateTime(new Date()).slice(0, 10), occurredTime: localDateTime(new Date()).slice(11, 16), note: "", amount: "", amountUnit: "毫升", petPreferenceIndex: 0, petPreferences: ["不设置", "养猫", "养狗", "养猫和狗"] },
  onLoad(options: Record<string, string>) { this.setData({ id: options.id || "" }); void this.load(); },
  async load() {
    this.setData({ loading: true });
    try {
      const response = await wx.cloud.callFunction({ name: "care-api", data: { action: "plants.get", id: this.data.id } });
      const result = response.result as { plant: Plant; events: CareEvent[]; tasks: PendingTask[]; photos: PlantPhoto[]; careGuide?: { species: CareSpecies | null; rules: CareRule[] } };
      const events = result.events || [];
      const pendingTasks = result.tasks || [];
      this.setData({
        plant: result.plant,
        careSpecies: result.careGuide?.species || null,
        careRules: result.careGuide?.rules || [],
        events,
        photos: result.photos || [],
        pendingTasks,
        taskNames: ["不关联待办", ...pendingTasks.map((item) => `${item.kind === "water" ? "浇水" : item.kind === "fertilize" ? "施肥" : "检查"} · ${localDateTime(item.dueAt)}`)],
        selectedTaskIndex: 0,
        visibleEvents: this.data.filter === "all" ? events : events.filter((item) => item.kind === this.data.filter),
        petPreferenceIndex: ["none", "cat", "dog", "both"].indexOf(result.plant.petPreference || "none"),
      });
    } catch (error) {
      console.error(error);
      wx.showToast({ title: "读取失败", icon: "none" });
    } finally {
      this.setData({ loading: false });
    }
  },
  onTaskChange(event: WechatMiniprogram.PickerChange) { this.setData({ selectedTaskIndex: Number(event.detail.value) }); },
  toggleCareDetails() { this.setData({ showCareDetails: !this.data.showCareDetails }); },
  onPhotoDateChange(event: WechatMiniprogram.PickerChange) { this.setData({ photoDate: String(event.detail.value) }); },
  scheduleCheck() {
    wx.setStorageSync("zhiwu:taskPrefill", { plantId: this.data.id, kind: "check" });
    wx.switchTab({ url: "/pages/today/index" });
  },
  onPhotoNoteInput(event: WechatMiniprogram.Input) { this.setData({ photoNote: event.detail.value }); },
  toggleCompare(event: WechatMiniprogram.TouchEvent) { const id = event.currentTarget.dataset.id as string; const selected = this.data.comparePhotos.some((item) => item._id === id) ? this.data.comparePhotos.filter((item) => item._id !== id) : [...this.data.comparePhotos, ...this.data.photos.filter((item) => item._id === id)].slice(-2); this.setData({ comparePhotos: selected }); },
  async deletePhoto(event: WechatMiniprogram.TouchEvent) { const id = event.currentTarget.dataset.id as string; const ok = await new Promise<boolean>((resolve) => wx.showModal({ title: "删除照片？", content: "删除后相册中不再显示。", success: (r) => resolve(r.confirm) })); if (!ok) return; try { await wx.cloud.callFunction({ name: "care-api", data: { action: "photos.delete", id } }); await this.load(); } catch (error) { console.error(error); wx.showToast({ title: "删除失败，请重试", icon: "none" }); } },
  onFilterChange(event: WechatMiniprogram.PickerChange) { const values = ["all", "water", "fertilize", "check", "observation", "milestone", "repot"]; const filter = values[Number(event.detail.value)]; this.setData({ filter, visibleEvents: filter === "all" ? this.data.events : this.data.events.filter((item) => item.kind === filter) }); },
  onEventKindChange(event: WechatMiniprogram.PickerChange) { this.setData({ eventKindIndex: Number(event.detail.value) }); },
  onObservationStatusChange(event: WechatMiniprogram.PickerChange) { this.setData({ observationStatusIndex: Number(event.detail.value) }); },
  onOccurredDateChange(event: WechatMiniprogram.PickerChange) { this.setData({ occurredDate: String(event.detail.value) }); },
  onOccurredTimeChange(event: WechatMiniprogram.PickerChange) { this.setData({ occurredTime: String(event.detail.value) }); },
  onNoteInput(event: WechatMiniprogram.Input) { this.setData({ note: event.detail.value }); },
  onAmountInput(event: WechatMiniprogram.Input) { this.setData({ amount: event.detail.value }); },
  onUnitInput(event: WechatMiniprogram.Input) { this.setData({ amountUnit: event.detail.value }); },
  editEvent(event: WechatMiniprogram.TouchEvent) { const item = this.data.events.find((record) => record._id === event.currentTarget.dataset.id); if (!item) return; const date = new Date(item.occurredAt); this.setData({ editingEventId: item._id, eventKindIndex: Math.max(0, this.data.eventKindValues.indexOf(item.kind)), observationStatusIndex: Math.max(0, this.data.observationStatusValues.indexOf(item.observationStatus || "unknown")), occurredDate: localDateTime(date).slice(0, 10), occurredTime: localDateTime(date).slice(11, 16), note: item.note || "", amount: item.amount == null ? "" : String(item.amount), amountUnit: item.amountUnit || "毫升" }); },
  async saveEvent() { const occurredAt = new Date(`${this.data.occurredDate}T${this.data.occurredTime}:00`); if (!Number.isFinite(occurredAt.getTime())) return wx.showToast({ title: "请选择发生时间", icon: "none" }); const wasEditing = Boolean(this.data.editingEventId); this.setData({ saving: true }); try { const data = wasEditing ? { action: "events.update", id: this.data.editingEventId, occurredAt: occurredAt.toISOString(), note: this.data.note, amount: this.data.amount, amountUnit: this.data.amountUnit, observationStatus: this.data.observationStatusValues[this.data.observationStatusIndex] } : { action: "events.create", requestId: `record-${Date.now()}`, plantId: this.data.id, kind: this.data.eventKindValues[this.data.eventKindIndex], occurredAt: occurredAt.toISOString(), note: this.data.note, amount: this.data.amount, amountUnit: this.data.amountUnit, observationStatus: this.data.observationStatusValues[this.data.observationStatusIndex], completeTaskId: this.data.selectedTaskIndex ? this.data.pendingTasks[this.data.selectedTaskIndex - 1]._id : "" }; await wx.cloud.callFunction({ name: "care-api", data }); this.setData({ note: "", amount: "", selectedTaskIndex: 0, editingEventId: "" }); wx.showToast({ title: wasEditing ? "已更正" : "已记录", icon: "success" }); await this.load(); } catch (error) { console.error(error); wx.showToast({ title: "保存失败，请重试", icon: "none" }); } finally { this.setData({ saving: false }); } },
  async deleteEvent(event: WechatMiniprogram.TouchEvent) { const id = event.currentTarget.dataset.id as string; const ok = await new Promise<boolean>((resolve) => wx.showModal({ title: "删除这条记录？", content: "删除后历史中不再显示。", success: (r) => resolve(r.confirm) })); if (!ok) return; try { await wx.cloud.callFunction({ name: "care-api", data: { action: "events.delete", id } }); wx.showToast({ title: "已删除", icon: "success" }); await this.load(); } catch (error) { console.error(error); wx.showToast({ title: "删除失败，请重试", icon: "none" }); } },
  async setPetPreference(event: WechatMiniprogram.PickerChange) { const index = Number(event.detail.value); try { await wx.cloud.callFunction({ name: "care-api", data: { action: "plants.setPetPreference", id: this.data.id, preference: ["none", "cat", "dog", "both"][index] } }); this.setData({ petPreferenceIndex: index }); } catch (error) { console.error(error); wx.showToast({ title: "保存偏好失败", icon: "none" }); } },
  copySource() { if (this.data.plant?.petSource) wx.setClipboardData({ data: this.data.plant.petSource, success: () => wx.showToast({ title: "来源链接已复制", icon: "success" }) }); },
  async addPhoto() { try { const chosen = await wx.chooseMedia({ count: 1, mediaType: ["image"], sourceType: ["album", "camera"] }); const file = chosen.tempFiles[0]; if (!file || file.size > 8 * 1024 * 1024) return wx.showToast({ title: "图片不能超过 8MB", icon: "none" }); const compressed = await wx.compressImage({ src: file.tempFilePath, quality: 80 }); const upload = await wx.cloud.uploadFile({ cloudPath: `plants/${this.data.id}/${Date.now()}.jpg`, filePath: compressed.tempFilePath }); await wx.cloud.callFunction({ name: "care-api", data: { action: "photos.add", plantId: this.data.id, fileId: upload.fileID, occurredAt: `${this.data.photoDate}T12:00:00`, note: this.data.photoNote } }); this.setData({ photoNote: "" }); wx.showToast({ title: "照片已保存", icon: "success" }); await this.load(); } catch (error) { console.error(error); wx.showToast({ title: "上传失败，请重试", icon: "none" }); } },
  confirmCommonSpecies(event: WechatMiniprogram.TouchEvent) { const species = event.currentTarget.dataset.species as string; const records: Record<string, { cat: PetStatus; dog: PetStatus; source: string; note: string }> = { "Epipremnum aureum": { cat: "toxic", dog: "toxic", source: "https://www.aspca.org/pet-care/aspca-poison-control/toxic-and-non-toxic-plants/golden-pothos", note: "ASPCA 列为对猫、狗有毒，含不溶性草酸钙。" }, "Chlorophytum comosum": { cat: "non_toxic", dog: "non_toxic", source: "https://www.aspca.org/pet-care/aspca-poison-control/toxic-and-non-toxic-plants/spider-plant", note: "ASPCA 资料列为对猫、狗无毒；这不等于可放心啃食或绝对安全。" }, "Chamaedorea elegans": { cat: "non_toxic", dog: "non_toxic", source: "https://www.aspca.org/pet-care/aspca-poison-control/toxic-and-non-toxic-plants/parlor-palm", note: "ASPCA 资料列为对猫、狗无毒；仍应避免宠物啃食。" }, "Lilium lancifolium": { cat: "toxic", dog: "non_toxic", source: "https://www.aspca.org/pet-care/aspca-poison-control/toxic-and-non-toxic-plants/tiger-lily", note: "ASPCA 对卷丹列为猫有毒、狗资料列为无毒。" } }; const record = records[species]; if (!record) return; wx.cloud.callFunction({ name: "care-api", data: { action: "plants.confirmSpecies", id: this.data.id, scientificName: species, catStatus: record.cat, dogStatus: record.dog, source: record.source, note: record.note, checkedAt: new Date().toISOString() } }).then(() => { wx.showToast({ title: "资料已保存", icon: "success" }); void this.load(); }).catch((error) => { console.error(error); wx.showToast({ title: "保存失败", icon: "none" }); }); },
});
