# 峰跑

`峰跑` 是一个 HTML5 Canvas 横版自动跑酷平台跳跃小游戏，可以在电脑浏览器和苹果手机 Safari 中运行。

## 操作

- 跳跃：空格 / W / ↑ / 手机右下角“跳跃”。空中再按一次可以二段跳。
- 下蹲：S / ↓ / 手机左下角“下蹲”
- 加速：Shift / 手机右侧“加速”，按住变快，松开恢复
- 重新开始：R
- 退出本局：Esc。网页不能强制关闭 Safari，所以这里会回到开始界面。

## 角色动画素材

游戏现在使用精灵帧动画，不再直接把整张方形原图作为 player 绘制。

角色动画帧放在：

```text
assets/player/
```

当前项目已经从 `assets/images/player.png` 生成了这些透明背景 PNG：

```text
assets/player/run_0.png
assets/player/run_1.png
assets/player/run_2.png
assets/player/run_3.png
assets/player/jump.png
assets/player/crouch.png
assets/player/idle.png
```

如果以后想替换成更专业的动画，请直接用同名透明 PNG 覆盖这些文件。要求：

- 透明背景，不要带白色、黑色或原图背景框
- 人物朝右
- 文件名保持不变
- 跑步帧为 `run_0.png` 到 `run_3.png`
- 跳跃、下蹲、待机分别为 `jump.png`、`crouch.png`、`idle.png`

游戏会自动按人物透明区域测量边界并高清缩放，避免拉伸变形。

## 图片和音乐

- 原始主角图片：`assets/images/player.png`
- 背景音乐：`assets/music/bgm.mp3`

当前项目已经把根目录里的 `1.mp3` 复制为 `assets/music/bgm.mp3`，点击“开始游戏”后会把它作为背景音乐循环播放。默认音量是 `0.4`，可以在 `src/config.js` 修改。

音乐链接已经写在 `src/config.js` 的 `MUSIC_URL` 中：

```js
MUSIC_URL: "https://www.bilibili.com/list/ml1503620658?oid=116657234254017&bvid=BV1PSV86bEcj"
```

手机浏览器不能可靠地直接播放 Bilibili 页面链接，也常会被跨域、登录或热链限制拦住。请使用你有权使用的 mp3 文件，并放到 `assets/music/bgm.mp3`。

## 电脑本地运行

因为浏览器模块、音乐和 Service Worker 都需要 HTTP 环境，建议不要直接双击 `index.html`。

```bash
python -m http.server 8000
```

然后打开：

```text
http://localhost:8000/
```

如果你的系统使用 `py` 命令：

```bash
py -m http.server 8000
```

## 打包成网页

这是一个静态网页项目，不需要构建步骤。发布时保留这些文件即可：

```text
index.html
css/
src/
assets/
manifest.webmanifest
service-worker.js
README.md
```

也可以直接把整个文件夹压缩成 zip，上传到任意静态网站托管服务。

## 部署到 GitHub Pages

1. 在 GitHub 新建一个仓库。
2. 在本地项目目录执行：

```bash
git init
git add .
git commit -m "Add Feng Pao web game"
git branch -M main
git remote add origin https://github.com/你的用户名/你的仓库名.git
git push -u origin main
```

3. 打开仓库的 `Settings` -> `Pages`。
4. `Build and deployment` 选择 `Deploy from a branch`。
5. Branch 选择 `main`，目录选择 `/root`，保存。
6. 等待 GitHub 生成网址，通常是：

```text
https://你的用户名.github.io/你的仓库名/
```

## 苹果手机 Safari 打开和添加到主屏幕

1. 用 iPhone Safari 打开本地局域网地址或 GitHub Pages 地址。
2. 横屏游玩体验最好。
3. 点击“开始游戏”，音乐才会播放，这是 iOS Safari 的浏览器限制。
4. 点击 Safari 底部分享按钮。
5. 选择“添加到主屏幕”。
6. 之后可以从桌面图标启动。

如果在电脑本地测试手机访问，请让电脑和 iPhone 连接同一个 Wi-Fi，然后在电脑上运行：

```bash
python -m http.server 8000 --bind 0.0.0.0
```

在 Windows 的 `ipconfig` 中找到电脑 IPv4 地址，用 iPhone Safari 打开：

```text
http://电脑IPv4地址:8000/
```

如果打不开，通常需要允许 Windows 防火墙放行 Python。
