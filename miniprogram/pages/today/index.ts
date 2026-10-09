type PlantOption = { _id: string; name: string; species: string };
type Kind = "water" | "fertilize" | "check";
type Task = { _id: string; plantId: string; plantName: string; kind: Kind; dueAt: string | Date; note: string; status: string };
type TaskView = Task & { kindLabel: string; dueLabel: string; group: "overdue" | "today" | "future" };
const KIND_LABELS: Record<Kind, string> = { water: "浇水", fertilize: "施肥", check: "检查" };
const KINDS: Kind[] = ["water", "fertilize", "check"];
function dateString(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function dayStart(date: Date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime(); }

Page({
  data: { plants: [] as PlantOption[], plantNames: [] as string[], selectedPlantIndex: 0, taskKinds: ["浇水", "施肥", "检查"], selectedKindIndex: 0, dueDate: dateString(new Date()), dueTime: "09:00", note: "", tasks: [] as TaskView[], completed: [] as Task[], overdue: [] as TaskView[], today: [] as TaskView[], future: [] as TaskView[], loading: false, saving: false, busyId: "", editingId: "" },
  onShow() { void this.loadData(); },
  async loadData() {
    this.setData({ loading: true });
    try {
      const [p, t, c] = await Promise.all([wx.cloud.callFunction({ name: "care-api", data: { action: "plants.list" } }), wx.cloud.callFunction({ name: "care-api", data: { action: "tasks.list" } }), wx.cloud.callFunction({ name: "care-api", data: { action: "tasks.completedList" } })]);
      const plants = ((p.result as { plants: (PlantOption & { archived?: boolean })[] }).plants || []).filter((item) => !item.archived);
      const start = dayStart(new Date());
      const tasks = ((t.result as { tasks: Task[] }).tasks || []).map((task): TaskView => { const due = new Date(task.dueAt); const dueDay = dayStart(due); const group = dueDay < start ? "overdue" : dueDay === start ? "today" : "future"; return { ...task, kindLabel: KIND_LABELS[task.kind] || "养护", dueLabel: `${dateString(due)} ${String(due.getHours()).padStart(2, "0")}:${String(due.getMinutes()).padStart(2, "0")}`, group }; });
      this.setData({ plants, plantNames: plants.map((item) => item.name), tasks, completed: (c.result as { tasks: Task[] }).tasks || [], overdue: tasks.filter((item) => item.group === "overdue"), today: tasks.filter((item) => item.group === "today"), future: tasks.filter((item) => item.group === "future") });
    } catch (error) { console.error(error); wx.showToast({ title: "读取失败，请稍后重试", icon: "none" }); } finally { this.setData({ loading: false }); }
  },
  onPlantSelect(event: WechatMiniprogram.PickerChange) { this.setData({ selectedPlantIndex: Number(event.detail.value) }); },
  onKindSelect(event: WechatMiniprogram.PickerChange) { this.setData({ selectedKindIndex: Number(event.detail.value) }); },
  onDateChange(event: WechatMiniprogram.PickerChange) { this.setData({ dueDate: String(event.detail.value) }); },
  onTimeChange(event: WechatMiniprogram.PickerChange) { this.setData({ dueTime: String(event.detail.value) }); },
  onNoteInput(event: WechatMiniprogram.Input) { this.setData({ note: event.detail.value }); },
  editTask(event: WechatMiniprogram.TouchEvent) { const task = this.data.tasks.find((item) => item._id === event.currentTarget.dataset.id); if (!task) return; const due = new Date(task.dueAt); this.setData({ editingId: task._id, dueDate: dateString(due), dueTime: `${String(due.getHours()).padStart(2, "0")}:${String(due.getMinutes()).padStart(2, "0")}`, note: task.note, selectedKindIndex: KINDS.indexOf(task.kind), selectedPlantIndex: Math.max(0, this.data.plants.findIndex((item) => item._id === task.plantId)) }); },
  cancelEdit() { this.setData({ editingId: "", note: "", dueDate: dateString(new Date()), dueTime: "09:00" }); },
  async saveTask() {
    const plant = this.data.plants[this.data.selectedPlantIndex]; if (!plant) return wx.showToast({ title: "请先添加植物", icon: "none" }); const dueAt = new Date(`${this.data.dueDate}T${this.data.dueTime}:00`); if (!Number.isFinite(dueAt.getTime())) return wx.showToast({ title: "请选择有效时间", icon: "none" }); const wasEditing = Boolean(this.data.editingId); this.setData({ saving: true });
    try { const data = wasEditing ? { action: "tasks.update", id: this.data.editingId, kind: KINDS[this.data.selectedKindIndex], dueAt: dueAt.toISOString(), note: this.data.note } : { action: "tasks.create", plantId: plant._id, kind: KINDS[this.data.selectedKindIndex], dueAt: dueAt.toISOString(), note: this.data.note }; await wx.cloud.callFunction({ name: "care-api", data }); this.cancelEdit(); wx.showToast({ title: wasEditing ? "已保存" : "已安排", icon: "success" }); await this.loadData(); } catch (error) { console.error(error); wx.showToast({ title: "保存失败，请重试", icon: "none" }); } finally { this.setData({ saving: false }); }
  },
  async completeTask(event: WechatMiniprogram.TouchEvent) { const id = event.currentTarget.dataset.id as string; if (this.data.busyId) return; this.setData({ busyId: id }); try { await wx.cloud.callFunction({ name: "care-api", data: { action: "tasks.complete", id } }); wx.showToast({ title: "已记录完成", icon: "success" }); await this.loadData(); } catch (error) { console.error(error); wx.showToast({ title: "操作失败，请重试", icon: "none" }); } finally { this.setData({ busyId: "" }); } },
  postponeTask(event: WechatMiniprogram.TouchEvent) { const id = event.currentTarget.dataset.id as string; wx.showActionSheet({ itemList: ["明天", "三天后", "自选日期"], success: async (result) => { const choice = result.tapIndex === 0 ? "tomorrow" : result.tapIndex === 1 ? "three_days" : "custom"; let dueAt = ""; if (choice === "custom") { const value = await new Promise<string>((resolve) => wx.showModal({ title: "输入日期", editable: true, placeholderText: dateString(new Date(Date.now() + 86400000)), success: (r) => resolve(r.confirm ? r.content : "") })); if (!value) return; dueAt = `${value}T09:00:00+08:00`; } try { await wx.cloud.callFunction({ name: "care-api", data: { action: "tasks.postpone", id, choice, dueAt } }); wx.showToast({ title: "已延期", icon: "success" }); await this.loadData(); } catch (error) { console.error(error); wx.showToast({ title: "延期失败，请重试", icon: "none" }); } } }); },
  async cancelTask(event: WechatMiniprogram.TouchEvent) { const id = event.currentTarget.dataset.id as string; const confirmed = await new Promise<boolean>((resolve) => wx.showModal({ title: "取消任务？", content: "取消后不会生成养护记录。", success: (r) => resolve(r.confirm) })); if (!confirmed) return; try { await wx.cloud.callFunction({ name: "care-api", data: { action: "tasks.cancel", id } }); wx.showToast({ title: "已取消", icon: "success" }); await this.loadData(); } catch (error) { console.error(error); wx.showToast({ title: "取消失败，请重试", icon: "none" }); } },
  async undoTask(event: WechatMiniprogram.TouchEvent) { const id = event.currentTarget.dataset.id as string; try { await wx.cloud.callFunction({ name: "care-api", data: { action: "tasks.undo", id } }); wx.showToast({ title: "已撤销完成", icon: "success" }); await this.loadData(); } catch (error) { console.error(error); wx.showToast({ title: "撤销失败，请重试", icon: "none" }); } },
});
