App({
  onLaunch() {
    if (!wx.cloud) {
      console.warn("当前微信版本不支持云开发，请更新微信后重试。");
      return;
    }

    wx.cloud.init({
      env: "cloudbase-d0g8d7xp96dde6c2e",
      traceUser: true,
    });
  },
});
