# GenAI Typing

AIが生成するコードでタイピング練習ができるWebアプリケーション。
言語やフレームワークを選び、お題を入力すると、LLMが実用的なコードスニペットを生成。それをタイピングして練習できます。

## 機能

- **24言語対応**: Python, Go, TypeScript, JavaScript, Rust, Java, C, C++, C#, Kotlin, Swift, Dart, Ruby, PHP, Scala, Elixir, Haskell, Lua, R, Shell, SQL, HCL, YAML, Dockerfile
- **フレームワーク指定**: 各言語ごとに主要フレームワーク（FastAPI, React, LangChain など）を選択可能
- **AI コード生成**: LangGraph パイプライン（Refiner → Generator → Validator）で品質の高いコードを生成
- **マルチプロバイダー LLM**: Groq と Google Gemini をノードごとにフォールバック
- **タイピング練習 UI**: WPM・正確率のリアルタイム計測、フォーカスウィンドウ表示、完了後のミス確認
- **4テーマ対応**: Dark / Light / Solarized / Monokai

## ディレクトリ構成

```
genai-typing/
├── .env.example                  # 環境変数テンプレート
├── .gitignore
├── package.json                  # ルート（npm workspaces）
├── README.md
└── apps/frontend/                # Nuxt 3 アプリ
    ├── nuxt.config.ts            # Nuxt 設定・環境変数読み込み・Vercel設定
    ├── package.json              # 依存関係
    ├── tsconfig.json
    ├── app.vue                   # ルートコンポーネント
    ├── assets/
    │   └── css/main.css          # グローバルCSS・4テーマ定義
    ├── layouts/
    │   └── default.vue           # 共通レイアウト（ヘッダー・テーマ切替）
    ├── pages/
    │   └── index.vue             # メインページ（設定画面 ↔ 練習画面の切替）
    ├── components/
    │   ├── SetupForm.vue         # 言語・フレームワーク選択、プロンプト入力
    │   ├── TypingEngine.vue      # タイピングロジック・キー入力処理・結果表示
    │   └── CodeDisplay.vue       # コード表示（フォーカスウィンドウ / 全体表示）
    ├── stores/
    │   └── typing.ts             # Pinia ストア（状態管理・API呼び出し）
    └── server/
        └── api/
            └── generate.post.ts  # サーバーAPI（LangGraph パイプライン）
```

## アーキテクチャ

### フロントエンド

- **Nuxt 3** + **Vue 3** で SPA 的に動作
- **Pinia** で状態管理（言語, フレームワーク, プロンプト, 生成コード, ローディング状態, エラー）
- `pages/index.vue` で `store.code` の有無により `SetupForm` と `TypingEngine` を切り替え

### サーバー API (`POST /api/generate`)

Nuxt のサーバールート（Nitro）として実装。LangGraph の `StateGraph` で3ノードのパイプラインを実行:

1. **Refiner** — ユーザーのプロンプトをタイピング練習用に最適化
2. **Generator** — 最適化されたプロンプトからコードを生成（マークダウンコードブロック形式）
3. **Validator** — 空チェック、行数チェック（60行未満）、日本語混入チェック、LLM 構文チェック

不合格の場合は具体的な失敗理由を Generator に渡して再生成（最大3回リトライ）。

### LLM モデル構成（ノードごとのフォールバック）

| ノード | 1st | 2nd | 3rd | 4th |
|--------|-----|-----|-----|-----|
| Refiner | llama-3.1-8b (Groq) | llama-4-scout (Groq) | gemini-2.5-flash-lite |  |
| Generator | llama-3.3-70b (Groq) | qwen3-32b (Groq) | llama-4-scout (Groq) | gemini-2.5-pro |
| Validator | llama-3.1-8b (Groq) | qwen3-32b (Groq) | gemini-3.1-flash-lite |  |

429 エラー（レート制限）が返ってきた場合、次のモデルに自動フォールバックします。

### セキュリティ

- API キーはサーバー専用（`runtimeConfig` の `public` 外）
- `language` / `framework` はホワイトリスト検証
- `prompt` はサーバー側で `trim()` + 100文字切り詰め
- IP ベースのレート制限（Upstash Redis、60秒/10リクエスト）
- 生成コードの日本語混入は Validator + 最終防衛チェックで排除

## セットアップ

### 前提条件

- Node.js 18 以上
- Groq API キー および/または Google AI (Gemini) API キー

### インストール

```bash
git clone https://github.com/tasotaso0503/genai-typing.git
cd genai-typing
npm install
```

### 環境変数

```bash
cp .env.example .env
```

`.env` を編集:

```
GOOGLE_API_KEY=your-google-api-key
GROQ_API_KEY=your-groq-api-key
```

少なくともどちらか一方の API キーが必要です。両方設定するとフォールバックが有効になります。

### 開発サーバー

```bash
npm run dev
# → http://localhost:3000
```

サーバー API（`/api/generate`）は Nuxt のサーバールートとして含まれているため、これだけで動作します。

## Vercel へのデプロイ

### 1. Vercel ダッシュボードの設定

| 設定項目 | 値 |
|---------|---|
| Root Directory | `apps/frontend` |
| Framework Preset | Nuxt.js（自動検出） |

### 2. 環境変数の追加

Settings → Environment Variables で以下を追加:

- `GOOGLE_API_KEY`
- `GROQ_API_KEY`

### 3. レート制限の有効化（任意）

Storage → Create Database → Browse Marketplace → **Upstash Redis** をインストール。
作成すると `UPSTASH_REDIS_REST_URL` と `UPSTASH_REDIS_REST_TOKEN` が環境変数に自動追加されます。
設定しない場合、レート制限なしで動作します。Upstash の無料枠（10,000コマンド/日）で十分です。

### 注意事項

- Vercel Hobby プランではサーバーレス関数のタイムアウトが最大 **10秒** です
- リトライ上限は3回に設定済みで、10秒以内に収まる想定です

## 技術スタック

| カテゴリ | 技術 |
|---------|------|
| フロントエンド | Nuxt 3, Vue 3, Pinia |
| サーバー | Nitro (Nuxt Server Routes) |
| AI パイプライン | LangGraph, LangChain |
| LLM プロバイダー | Groq, Google Gemini |
| レート制限 | Upstash Redis (@upstash/ratelimit) |
| デプロイ | Vercel |
