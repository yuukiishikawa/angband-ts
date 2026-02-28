# Angband-TS

C版 [Angband 4.2.6](https://angband.github.io/angband/) の TypeScript 移植。
ブラウザ上でプレイ可能。

## セットアップ

```bash
npm install
npm run build
```

## 開発

```bash
npm run dev          # Vite dev server (ブラウザでプレイ)
npm run typecheck    # TypeScript 型チェック
npm run test         # Vitest テスト実行
```

## プロジェクト構成

```
packages/
  @angband/core/     ゲームロジック（プレイヤー、モンスター、ダンジョン生成等）
  @angband/web/      ブラウザUI（Canvas描画、キーボード入力）
```

## Borg リモートサーバー

C版 Borg（自動プレイAI）が TCP 経由で TS 版 Angband をプレイするためのサーバーを
提供する。C版 Borg の AI ロジックがそのまま TS エンジン上で動作するため、
両実装のクロステストに利用できる。

### 起動方法

```bash
# Terminal 1: TS リモートサーバー起動
npx tsx packages/@angband/core/src/borg/remote-server.ts --port 9876

# Terminal 2: C版 Borg を接続
cd ../angband
angband -mborg -n -- --remote localhost:9876
```

### オプション

| フラグ | デフォルト | 説明 |
|--------|-----------|------|
| `--port` | 9876 | TCP 待ち受けポート |
| `--race` | Human | プレイヤー種族 |
| `--class` | Warrior | プレイヤー職業 |
| `--seed` | (時刻) | 乱数シード（再現テスト用） |

### プロトコル概要

サーバーはゲーム画面を `FRAME/ROW/CURSOR/STAT/INVEN/END` 形式でクライアントに送信し、
クライアントからの `KEY <code> <mods>` メッセージをゲームコマンドに変換する。

## ドキュメント

- [ARCHITECTURE.md](ARCHITECTURE.md) — アーキテクチャ図
- [PLAN.md](PLAN.md) — 移植計画と進捗
- [PORTING_DIFF.md](PORTING_DIFF.md) — C版との差分
