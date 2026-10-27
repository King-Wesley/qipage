# 栖页 Android

目标：下载 APK、安装、打开即用。不需要电脑在线、Termux、Node.js 或自己运行服务器。首次使用可直接使用离线时钟、搜索入口、收藏和内置背景；DeepSeek 功能需要自己的 API Key 和网络，并会产生账户用量。

## 安装与使用

安装正式签名的 `qipage-0.3.2.apk`，首次打开后点击「开始使用」。右上角「每日内容」填写 Key 和关注领域，保存并测试，再点「现在更新」。收藏、外观和内容保存在当前手机，不与电脑版自动同步。卸载应用将清除数据。

应用打开时每分钟检查北京时间的更新计划，重新打开会补更新。首版不注册后台常驻服务，也不承诺关闭后精确到点更新。无网时保留上次内容并标明日期。

支持 Android 6.0 及以上，需保持 Android System WebView / Chrome 更新。布局和 JavaScript 使用现代 WebView 功能（建议 Chromium 100 以上）。老设备如果无法更新 WebView，不属于已验证兼容范围。

## 实现

- Capacitor Android 7.6.9 承载原有界面，手机端不运行 Node.js 或 HTTP 服务器。
- 复用 `../daily-service.cjs` 的日期筛选、候选校验、去重、并发、错误保留和重试逻辑；构建时为文件、路径和哈希功能提供移动适配器。
- 原生 `QipageStore` 插件提供限定域名的 HTTPS 请求、原子保存和外部浏览器打开。仅允许 DeepSeek 与 Bing；禁止跟随重定向，响应最大 10 MB；授权头只发送至 DeepSeek。
- 配置、新闻、壁纸快照使用 Android Keystore 中的 AES-GCM 密钥加密，原子写入应用私有 `noBackupFilesDir`。关闭应用备份；密钥不写进 APK、GitHub、localStorage 或配置接口响应。
- 收藏、外观仍使用应用 WebView 的 localStorage，随应用保留。搜索和外链交给系统浏览器，远程页面不进入持有原生桥的 WebView。
- 打包只复制固定的前端文件和 `assets/`，不会复制 `.private/`、`.git/`、桌面运行环境或用户配置。

## 开发构建

需要 Node.js 22+、JDK 21、Android SDK Platform 35 / Build Tools 35.0.0。

```sh
cd mobile
npm ci
npm run sync
npm test
cd android
./gradlew assembleDebug lintDebug
```

Windows 使用 `gradlew.bat`。预览包位于 `mobile/android/app/build/outputs/apk/debug/`，应用 ID 带 `.preview`，可与正式版并存。GitHub Actions 会在此分支推送或手动运行时构建预览包；在对应运行的 Artifacts 下载并解压。

`npm run sync` 必须在 Gradle 构建前执行，生成前端资产和 Capacitor 项目引用。生成物不提交。桌面版测试继续在仓库根目录运行 `npm test`。

## 正式签名与升级

正式包应用 ID 为 `com.kingwesley.qipage`。构建前设置以下环境变量：

- `QIPAGE_KEYSTORE`：你保管的签名证书绝对路径
- `QIPAGE_STORE_PASSWORD`：证书密码
- `QIPAGE_KEY_ALIAS`：密钥别名
- `QIPAGE_KEY_PASSWORD`：密钥密码

然后运行 `gradlew assembleRelease`。未提供完整签名配置时正式构建会失败，避免误发不可安装的未签名包。签名材料不进 Git；升级必须使用相同证书并提高 `versionCode`。请备份签名文件和密码，丢失后无法覆盖更新已安装的正式版。

## 验证范围

自动测试覆盖手机存储冷启动恢复、删除密钥、写入失败与重试、完整新闻/壁纸更新、原生网络响应解码和地址限制。桌面已有测试验证复用的筛选逻辑。发布前还需在实际安卓设备验证：安装、离线首次启动、收藏/照片选择、杀进程后恢复、DeepSeek 实际连接、外链/返回键、断网保留内容以及同证书升级。模拟测试不消耗真实 API 额度。


0.3.2 合入四种时钟、白色文字与手动配色；正式版 versionCode 为 2，使用原有签名证书，可覆盖更新 0.3.0 并保留应用数据。
