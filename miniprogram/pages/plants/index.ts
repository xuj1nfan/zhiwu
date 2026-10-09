type PlantSummary = {
  _id: string;
  name: string;
  species: string;
  location?: string;
  archived?: boolean;
  petSummary?: { cat: string; dog: string };
  petPreference?: string;
};

Page({
  data: {
    plants: [] as PlantSummary[],
    name: "",
    species: "",
    editingId: "",
    loading: false,
    saving: false,
    location: "",
  },

  onShow() {
    void this.loadPlants();
  },

  onNameInput(event: WechatMiniprogram.Input) {
    this.setData({ name: event.detail.value });
  },

  onSpeciesInput(event: WechatMiniprogram.Input) {
    this.setData({ species: event.detail.value });
  },

  onLocationInput(event: WechatMiniprogram.Input) {
    this.setData({ location: event.detail.value });
  },

  async loadPlants() {
    this.setData({ loading: true });
    try {
      const response = await wx.cloud.callFunction({
        name: "care-api",
        data: { action: "plants.list" },
      });
      const result = response.result as { plants: PlantSummary[] };
      this.setData({ plants: result.plants ?? [] });
    } catch (error) {
      console.error("Failed to load plants", error);
      wx.showToast({ title: "读取失败，请检查云环境", icon: "none" });
    } finally {
      this.setData({ loading: false });
    }
  },

  async savePlant() {
    const name = this.data.name.trim();
    const species = this.data.species.trim();
    if (!name) {
      wx.showToast({ title: "请填写植物昵称", icon: "none" });
      return;
    }

    const editing = Boolean(this.data.editingId);
    this.setData({ saving: true });
    try {
      await wx.cloud.callFunction({
        name: "care-api",
        data: this.data.editingId
          ? { action: "plants.update", id: this.data.editingId, name, species, location: this.data.location }
          : { action: "plants.create", name, species, location: this.data.location },
      });
      this.cancelEdit();
      wx.showToast({ title: editing ? "已保存" : "已添加", icon: "success" });
      await this.loadPlants();
    } catch (error) {
      console.error("Failed to create plant", error);
      wx.showToast({ title: "保存失败，请检查云环境", icon: "none" });
    } finally {
      this.setData({ saving: false });
    }
  },

  editPlant(event: WechatMiniprogram.TouchEvent) {
    const plant = this.data.plants.find((item) => item._id === event.currentTarget.dataset.id);
    if (!plant) return;
    this.setData({ editingId: plant._id, name: plant.name, species: plant.species, location: plant.location || "" });
  },

  openDetail(event: WechatMiniprogram.TouchEvent) {
    const id = event.currentTarget.dataset.id as string;
    wx.navigateTo({ url: `/pages/plants/detail?id=${encodeURIComponent(id)}` });
  },

  async toggleArchive(event: WechatMiniprogram.TouchEvent) {
    const id = event.currentTarget.dataset.id as string;
    const plant = this.data.plants.find((item) => item._id === id);
    if (!plant) return;
    try {
      await wx.cloud.callFunction({ name: "care-api", data: { action: plant.archived ? "plants.restore" : "plants.archive", id } });
      wx.showToast({ title: plant.archived ? "已恢复" : "已归档", icon: "success" });
      await this.loadPlants();
    } catch (error) {
      console.error(error);
      wx.showToast({ title: "操作失败，请重试", icon: "none" });
    }
  },

  cancelEdit() {
    this.setData({ editingId: "", name: "", species: "", location: "" });
  },

  deletePlant(event: WechatMiniprogram.TouchEvent) {
    const id = event.currentTarget.dataset.id as string;
    const plant = this.data.plants.find((item) => item._id === id);
    if (!plant) return;
    wx.showModal({
      title: "删除植物档案？",
      content: `删除“${plant.name}”会同时删除它的养护记录，并取消未完成的任务。`,
      confirmText: "删除",
      confirmColor: "#b5473c",
      success: async (result) => {
        if (!result.confirm) return;
        try {
          await wx.cloud.callFunction({
            name: "care-api",
            data: { action: "plants.delete", id },
          });
          if (this.data.editingId === id) this.cancelEdit();
          wx.showToast({ title: "已删除", icon: "success" });
          await this.loadPlants();
        } catch (error) {
          console.error("Failed to delete plant", error);
          wx.showToast({ title: "删除失败，请稍后重试", icon: "none" });
        }
      },
    });
  },
});
