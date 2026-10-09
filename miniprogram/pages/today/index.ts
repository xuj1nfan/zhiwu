type PlantOption = { _id: string; name: string; species: string };
type TaskRecord = {
  _id: string;
  plantId: string;
  plantName: string;
  kind: "water" | "fertilize" | "check";
  dueAt: string | Date;
  note: string;
  status: string;
};
type TaskView = TaskRecord & { kindLabel: string; dueLabel: string; overdue: boolean };

const KIND_LABELS: Record<TaskRecord["kind"], string> = {
  water: "浇水",
  fertilize: "施肥",
  check: "检查",
};

function localDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

Page({
  data: {
    plants: [] as PlantOption[],
    plantNames: [] as string[],
    selectedPlantIndex: 0,
    taskKinds: ["浇水", "施肥", "检查"],
    selectedKindIndex: 0,
    dueDate: localDateString(new Date()),
    note: "",
    tasks: [] as TaskView[],
    loading: false,
    saving: false,
  },

  onShow() {
    void this.loadData();
  },

  async loadData() {
    this.setData({ loading: true });
    try {
      const [plantsResponse, tasksResponse] = await Promise.all([
        wx.cloud.callFunction({ name: "care-api", data: { action: "plants.list" } }),
        wx.cloud.callFunction({ name: "care-api", data: { action: "tasks.list" } }),
      ]);
      const plantsResult = plantsResponse.result as { plants: PlantOption[] };
      const tasksResult = tasksResponse.result as { tasks: TaskRecord[] };
      const plants = plantsResult.plants ?? [];
      const now = Date.now();
      const tasks = (tasksResult.tasks ?? []).map((task): TaskView => {
        const dueTime = new Date(task.dueAt).getTime();
        return {
          ...task,
          kindLabel: KIND_LABELS[task.kind] ?? "养护",
          dueLabel: new Date(task.dueAt).toLocaleString("zh-CN", {
            month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
          }),
          overdue: dueTime < now,
        };
      });
      this.setData({
        plants,
        plantNames: plants.map((plant) => plant.name),
        tasks,
      });
    } catch (error) {
      console.error("Failed to load care data", error);
      wx.showToast({ title: "读取失败，请检查云函数和数据集合", icon: "none" });
    } finally {
      this.setData({ loading: false });
    }
  },

  onPlantSelect(event: WechatMiniprogram.PickerChange) {
    this.setData({ selectedPlantIndex: Number(event.detail.value) });
  },

  onKindSelect(event: WechatMiniprogram.PickerChange) {
    this.setData({ selectedKindIndex: Number(event.detail.value) });
  },

  onDateChange(event: WechatMiniprogram.PickerChange) {
    this.setData({ dueDate: String(event.detail.value) });
  },

  onNoteInput(event: WechatMiniprogram.Input) {
    this.setData({ note: event.detail.value });
  },

  async createTask() {
    const plant = this.data.plants[this.data.selectedPlantIndex];
    if (!plant) {
      wx.showToast({ title: "请先添加植物", icon: "none" });
      return;
    }
    const dueAt = new Date(`${this.data.dueDate}T09:00:00`);
    if (!Number.isFinite(dueAt.getTime())) {
      wx.showToast({ title: "请选择有效日期", icon: "none" });
      return;
    }
    const kinds: TaskRecord["kind"][] = ["water", "fertilize", "check"];
    this.setData({ saving: true });
    try {
      await wx.cloud.callFunction({
        name: "care-api",
        data: {
          action: "tasks.create",
          plantId: plant._id,
          kind: kinds[this.data.selectedKindIndex],
          dueAt: dueAt.toISOString(),
          note: this.data.note,
        },
      });
      this.setData({ note: "" });
      wx.showToast({ title: "已安排", icon: "success" });
      await this.loadData();
    } catch (error) {
      console.error("Failed to create care task", error);
      wx.showToast({ title: "安排失败，请稍后重试", icon: "none" });
    } finally {
      this.setData({ saving: false });
    }
  },

  async completeTask(event: WechatMiniprogram.TouchEvent) {
    const id = event.currentTarget.dataset.id as string;
    try {
      await wx.cloud.callFunction({ name: "care-api", data: { action: "tasks.complete", id } });
      wx.showToast({ title: "已记录完成", icon: "success" });
      await this.loadData();
    } catch (error) {
      console.error("Failed to complete care task", error);
      wx.showToast({ title: "操作失败，请稍后重试", icon: "none" });
    }
  },

  async postponeTask(event: WechatMiniprogram.TouchEvent) {
    const id = event.currentTarget.dataset.id as string;
    try {
      await wx.cloud.callFunction({ name: "care-api", data: { action: "tasks.postpone", id } });
      wx.showToast({ title: "已顺延一天", icon: "success" });
      await this.loadData();
    } catch (error) {
      console.error("Failed to postpone care task", error);
      wx.showToast({ title: "操作失败，请稍后重试", icon: "none" });
    }
  },
});
