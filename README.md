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

## 账号配置

1. AppID `wx914c47d48b93a7fe` 和环境 ID `cloudbase-d0g8d7xp96dde6c2e` 已写入项目配置。
2. 在 CloudBase 控制台创建 `plants`、`care_tasks` 和 `care_events` 集合，并将读写权限设为“仅管理端可读写”。客户端不要直接读写；所有操作统一经过 `care-api`，由云函数按可信 OpenID 过滤用户数据。
3. `care_tasks` 保存待办/已完成状态和到期时间；`care_events` 保存已完成的养护记录。删除植物会取消其未完成任务并清除相关记录。
4. 微信订阅模板通过审核后，按模板字段配置订阅授权和发送逻辑；当前 `reminder-dispatch` 仍是空操作，不会发送消息，也不要部署为正式提醒服务。

小程序 AppID 和环境 ID 不是密钥，可以保存在项目配置中。代码上传密钥、AppSecret 等敏感凭据必须放在仓库外；代码上传密钥拥有预览与上传权限，遗失后需要重置。

## 本地检查

```bash
npm run typecheck
```

## iPhone 预览与上传

从微信公众平台“开发管理 → 开发设置”下载代码上传密钥，并把当前公网 IP 加入上传白名单。将密钥文件放在仓库外，例如 `~/.config/zhiwu/private.key`，再设置环境变量：

```bash
export WECHAT_APPID='实际小程序 AppID'
export WECHAT_PRIVATE_KEY="$HOME/.config/zhiwu/private.key"
npm run preview
```

使用管理员微信在 iPhone 扫描 `/tmp/zhiwu-preview.jpg`。预览正常后，可以上传开发版本：

```bash
npm run upload
```

## 部署 CloudBase

先在腾讯云控制台完成账号授权并创建环境，然后从项目根目录执行：

```bash
npx tcb login
npx tcb fn deploy care-api -e cloudbase-d0g8d7xp96dde6c2e
npx tcb fn list -e cloudbase-d0g8d7xp96dde6c2e
```

`care-api` 增加编辑、删除和任务接口后，需要重新部署：

```bash
npx tcb fn deploy care-api -e cloudbase-d0g8d7xp96dde6c2e
```

配置声明了每五分钟触发的 `reminder-dispatch`，但该函数当前没有发送逻辑；等真实模板、授权记录、去重和安全发送流程验证完成后再部署。

## 当前待办

- 在 CloudBase 创建 `care_tasks`、`care_events` 集合并设置为仅管理端可读写。
- 重新部署更新后的 `care-api`，再预览验证编辑、删除、安排、完成和顺延。
- 在微信后台确认合适的订阅模板；模板未获批前不承诺退出小程序后仍会收到通知。
- 小程序备案仍在审核，审核完成前不提交正式上线。
