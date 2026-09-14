# GenAI Typing

アプリURL: **https://genai-typing-frontend-ebon.vercel.app**

AIが生成するコードでタイピング練習ができるWebアプリケーション。
言語やフレームワークを選び、お題を入力すると、LLMが実用的なコードスニペットを生成。それをタイピングして練習できます。

## 機能

- **24言語対応**: Python, Go, TypeScript, JavaScript, Rust, Java, C, C++, C#, Kotlin, Swift, Dart, Ruby, PHP, Scala, Elixir, Haskell, Lua, R, Shell, SQL, HCL, YAML, Dockerfile
- **フレームワーク指定**: 各言語ごとに主要フレームワーク（FastAPI, React, LangChain など）を選択可能
- **AI コード生成**: LangGraph パイプライン（Refiner → Generator → Validator）で品質の高いコードを生成
- **マルチプロバイダー LLM**: Groq と Google Gemini をノードごとにフォールバック
- **タイピング練習 UI**: WPM・正確率のリアルタイム計測、フォーカスウィンドウ表示、完了後のミス確認、長い行の自動横スクロール
- **4テーマ対応**: Dark / Light / Solarized / Monokai

## ディレクトリ構成

```
genai-typing/
├── .github/workflows/ci.yml      # CI（lint / typecheck / test / build）
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
    ├── server/
    │   ├── api/
    │   │   └── generate.post.ts  # サーバーAPI（LangGraph パイプライン）
    │   └── utils/
    │       ├── models.ts         # モデル定義・LLM生成
    │       ├── errors.ts         # エラー分類（429 / 過負荷 / モデル提供終了）
    │       ├── fallback.ts       # モデルフォールバック・タイムアウト
    │       ├── parse.ts          # LLM出力のパース
    │       └── validate.ts       # 入力検証・言語別インデント
    ├── test/                     # Vitest（実APIは叩かずモック）
    ├── eslint.config.mjs
    └── vitest.config.ts
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
生成コードは1行80文字以内に制限し、空白のみの行は空行に変換してタイピングしやすくしています。

### LLM モデル構成（ノードごとのフォールバック）

| ノード | 1st | 2nd | 3rd |
|--------|-----|-----|-----|
| Refiner | gpt-oss-20b (Groq) | gemini-3.1-flash-lite |  |
| Generator | gpt-oss-120b (Groq) | qwen3.8-27b (Groq) | gemini-3.1-flash-lite |
| Validator | qwen3.6-27b (Groq) | gemini-3.1-flash-lite |  |

Groq の無料枠はモデル単位で独立しているため、ノード間で同じモデルを使い回さず分散させています。
Gemini は無料枠で pro 系が使えず、flash 系は thinking で30秒前後かかるため flash-lite を使用。

次のモデルにフォールバックする条件:

| エラー | 挙動 |
|--------|------|
| 429（レート制限） | 次のモデルへ |
| 503（一時的な過負荷） | 次のモデルへ |
| 404（モデル提供終了 / ID変更） | 次のモデルへ + エラーログ |
| その他（401 など） | フォールバックせず即座に失敗 |

全モデルが失敗した場合、原因がモデル提供終了のみなら `503` + `reason: model_unavailable` を返し
（待っても復旧しないため再試行を促さない）、レート制限が絡む場合は `429` + `retryAfterSec` を返します。

### セキュリティ

- API キーはサーバー専用（`runtimeConfig` の `public` 外）
- `language` / `framework` はホワイトリスト検証
- `prompt` はサーバー側で `trim()` + 100文字切り詰め
- IP ベースのレート制限（Upstash Redis、60秒/4リクエスト。Redis に接続できない場合はレート制限をスキップして処理を継続する）
- 生成コードの日本語混入は Validator + 最終防衛チェックで排除

## セットアップ

### 前提条件

- Node.js 22 以上（lint の実行に必要。アプリの動作のみなら 18 以上）
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

### 開発コマンド

| コマンド | 内容 |
|---------|------|
| `npm run dev` | 開発サーバー起動 |
| `npm run lint` | ESLint |
| `npm run typecheck` | 型チェック（vue-tsc） |
| `npm run test` | テスト実行（Vitest） |
| `npm run build` | 本番ビルド |

`npm run test:watch --workspace=apps/frontend` でウォッチモードになります。

### テスト

`apps/frontend/test/` に Vitest のテストを配置。**外部 API は全てモックしている**ため、API キーなしで実行できます。

| ファイル | 対象 |
|---------|------|
| `errors.spec.ts` | エラー分類（レート制限 / 過負荷 / モデル提供終了の判定と誤検出防止） |
| `fallback.spec.ts` | モデルフォールバック、全滅時のエラー区別、APIキーによる絞り込み |
| `timeout.spec.ts` | タイムアウト処理とタイマー解除 |
| `parse.spec.ts` | LLM 出力のパース（4形式 + 失敗時に null を返すこと） |
| `validate.spec.ts` | 入力検証（言語 / フレームワーク / 文字数制限） |
| `store.spec.ts` | Pinia ストアのエラー表示の出し分け |

### CI

`.github/workflows/ci.yml` で、`main` への push と Pull Request をトリガーに以下を実行します。

```
lint → typecheck → test → build
```

Node.js 22 を使用（ESLint 10 が `Object.groupBy` を使うため 20 では動きません）。
テストもビルドも API キーを必要としないため、CI 側にシークレットの設定は不要です。

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
作成すると `KV_REST_API_URL` と `KV_REST_API_TOKEN` が環境変数に自動追加されます。
設定しない場合、レート制限なしで動作します。Upstash の無料枠（50万コマンド/月）で十分です。

### 注意事項

- サーバーレス関数のタイムアウトは `nuxt.config.ts` で **30秒** に設定しています
  （Groq の枠を使い切って Gemini にフォールバックすると10秒近くかかるため）
- リトライ上限は3回
- Upstash の無料枠は **30日間アクセスが無いとデータベースがアーカイブ（削除）** されます。
  その場合もレート制限をスキップして動作は継続しますが、制限は無効になります

## 技術スタック

| カテゴリ | 技術 |
|---------|------|
| フロントエンド | Nuxt 3, Vue 3, Pinia |
| サーバー | Nitro (Nuxt Server Routes) |
| AI パイプライン | LangGraph, LangChain |
| LLM プロバイダー | Groq, Google Gemini |
| レート制限 | Upstash Redis (@upstash/ratelimit) |
| テスト | Vitest |
| Lint / 型チェック | ESLint (@nuxt/eslint), vue-tsc |
| CI | GitHub Actions |
| デプロイ | Vercel |

## 注意事項

AIが生成するコードは誤りを含む場合があります。学習目的のタイピング素材としてご利用ください。

## ライセンス

詳細は [LICENSE](./LICENSE) を参照してください。

- 個人利用・学習目的での使用・改変は自由です
- **商用利用は禁止**です
- 無断での再配布は禁止です
- 本ソフトウェアは「現状のまま」で提供され、利用・改変により生じたいかなる損害についても開発者は一切の責任を負いません
- AI が生成するコードの正確性・安全性は保証しません
