<div align="center">

# dsh-taskbar-reminder

**DeepSeek Harness 任务栏提醒插件。**

**简体中文** | [English](README.md)

</div>

本仓库是 DSH（当前本机安装为 `@deepseek-ai/dsh@0.1.1-rc.2`）Web 插件骨架。宿主侧与浏览器侧提醒行为尚未实现。

## 项目组成

| 层次 | 文件 | 职责 |
| --- | --- | --- |
| 宿主侧 | [`lib/index.js`](lib/index.js) | 空 `apply`，使插件能出现在宿主 Loader 中。 |
| 客户端 | [`lib/client.js`](lib/client.js) | 空的 `dsh.client` lazy-CJS factory。 |
| 组合包补丁 | [`cordis.patch.yml`](cordis.patch.yml) | 向 dsh profile 插入插件行。 |
| 包元数据 | [`package.json`](package.json) | 声明宿主入口、Web 客户端和组合包补丁。 |

## 从本地检出安装

```sh
dsh plugin --profile web add <path-or-tarball>
```

安装后需重启对应 profile。实现提醒行为前，先确认当前 DSH 版本和实际插件接口。

## 许可证

[MIT](LICENSE)
