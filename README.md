<div align="center">

# dsh-taskbar-reminder

**Taskbar reminder plugin for DeepSeek Harness.**

[简体中文](README.zh-CN.md)

</div>

This repository is a DSH (`@deepseek-ai/dsh@0.1.1-rc.2`) web plugin skeleton. Host and client behavior is not implemented yet.

## What ships

| Layer | File | Responsibility |
| --- | --- | --- |
| Host | [`lib/index.js`](lib/index.js) | Empty `apply` so the plugin can appear in the host Loader. |
| Client | [`lib/client.js`](lib/client.js) | Empty `dsh.client` lazy-CJS factory. |
| Bundle patch | [`cordis.patch.yml`](cordis.patch.yml) | Inserts the plugin row into the dsh profile. |
| Package metadata | [`package.json`](package.json) | Declares the host entry, web client, and bundle patch. |

## Install from a local checkout

```sh
dsh plugin --profile web add <path-or-tarball>
```

Restart the profile after installation. Confirm the current DSH version and plugin interfaces before implementing reminder behavior.

## License

[MIT](LICENSE)
