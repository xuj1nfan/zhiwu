# 植物养护助手

原生微信小程序 + TypeScript + CloudBase。当前已支持植物档案增删改查、养护任务安排、完成记录和顺延。微信订阅模板尚未找到，因此小程序内保留待办，后台主动消息暂不发送。

## 本机工具

开发环境基线为 Node.js 22；云函数使用 CloudBase 的 Node.js 20.19 运行时。仓库的 `.node-version` 已固定本地版本。CachyOS 可以通过系统包管理器安装 fnm：

```bash
sudo pacman -S fnm
```

在 `~/.bashrc` 中加入以下初始化，然后新开一个终端：

```bash
eval "$(fnm env --use-on-cd --shell bash)"
```

在项目目录启用 Node 22 并安装依赖：

```bash
fnm install 22
fnm use 22
npm install
```

Linux 微信开发者工具使用 [msojocs 社区移植版](https://github.com/msojocs/wechat-web-devtools-linux/releases)。下载 x86_64 稳定版并解压后，运行包内 `bin/wechat-devtools`。此工具优先适配 GNOME，Niri/Wayland 需实机验证。也可以只用 VS Code 编码，再用 `miniprogram-ci` 生成预览码和上传版本。
