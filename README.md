# jun-kbbase 🧠 (Japandi Ontology Knowledge Base)

> **개인 학습 온톨로지 지식 베이스 + 발행 가능한 개발 블로그 템플릿**  
> 노션이나 옵시디언 없이, 순수 마크다운(Markdown)과 Node.js 내장 서버만으로 구동되는 미려한 지식 그래프 엔진입니다.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-green.svg)
![Design](https://img.shields.io/badge/design-Japandi%20Mineral%20Paper-warm.svg)

---

## ✨ 핵심 기능

1. **온톨로지 지식 그래프 (D3.js)**:
   - 각 마크다운의 `relates_to` 관계와 본문 내 `[[id|위키링크]]`를 파싱하여 살아 움직이는 지식 네트워크 그래프를 자동 생성합니다.
2. **Japandi Mineral Paper 디자인 (ADHD 친화적 UX)**:
   - 눈이 편안한 와시 페이퍼 톤, 여백 중심의 집중 레이아웃, 8대 도메인별 색상 코딩.
3. **수식 및 다이어그램 완벽 지원**:
   - **KaTeX**: 인라인 `$E=mc^2$` 및 독립 블록 수식 지원.
   - **Mermaid**: 가로 잘림 방지 스크롤 컨테이너 및 전체화면 **라이트박스 줌/팬 모달(마우스 휠 확대/축소)** 내장.
4. **대화형 인터랙티브 HTML 위젯 임베드**:
   - Canvas, 슬라이더 시뮬레이터 등 직접 조작하는 학습 위젯을 `site/assets/interactive/`에 넣어 sandboxed `<iframe>`으로 임베드 가능.
5. **웹 브라우저 인라인 WYSIWYG 에디터 (Vditor)**:
   - 외부 에디터 없이도 브라우저에서 즉시 `수정` 버튼을 눌러 마크다운을 편집하고 라이브 프리뷰로 확인 가능.
6. **풀텍스트 온톨로지 검색**:
   - `/` 단축키로 제목, 본문, 온톨로지 관계 깊이(Depth)를 탐색하는 검색 오버레이 제공.

---

## 🚀 빠른 시작 가이드 (Quick Start)

### 1. 저장소 복제 및 의존성 설치
외부 무거운 라이브러리 없이 Node.js 기본 내장 기능으로 작동하므로 설치가 매우 가볍습니다:

```bash
git clone https://github.com/lidge-jun/jun-kbbase.git
cd jun-kbbase
npm install
```

### 2. 지식 베이스 빌드 (마크다운 → JSON 그래프)
마크다운 파일들을 파싱해 온톨로지 색인(`site/data/`)을 생성합니다:

```bash
npm run build
```

### 3. 로컬 서버 실행
```bash
npm run dev
# 또는 node server.js
```
브라우저에서 **`http://localhost:3456`** 접속!

---

## 📂 디렉토리 구조

```text
jun-kbbase/
├── knowledge/
│   ├── concepts/       # 개념 단위 지식 노드 (.md)
│   └── questions/      # Q&A 메모 (.md)
├── posts/              # 블로그 발행 글 (.md, published: true)
│   └── draft/          # 미발행 초안
├── site/               # Vanilla JS SPA 프론트엔드
│   └── assets/
│       └── interactive/# 대화형 인터랙티브 HTML 위젯 (.html)
├── build.js            # 마크다운 파서 및 온톨로지 D3 그래프 빌더
├── server.js           # 로컬 개발 및 자동 커밋 API 서버 (포트 3456)
└── DESIGN.md           # Japandi 디자인 토큰 및 UX 명세
```

---

## ✍️ 글과 개념 작성하는 법

### 1. 개념 노드 작성 (`knowledge/concepts/my-concept.md`)
Frontmatter에 ID와 관련 개념을 선언합니다:

```markdown
---
id: transformer
title: "트랜스포머(Transformer)"
tags: [ai, deep-learning, attention]
domain: ai
relates_to:
  - id: attention-mechanism
    relation: built_on
  - id: neural-network
    relation: part_of
created: 2026-09-17
---

## 핵심 개념
트랜스포머는 [[attention-mechanism|어텐션]]을 기반으로 동작하는 [[neural-network|신경망]]이다.
```

#### 지원하는 온톨로지 관계 (`relates_to`)
- `uses`: A가 B를 사용함
- `part_of`: A는 B의 일부
- `requires`: A를 이해하려면 B가 필요
- `extends`: A가 B를 확장함
- `foundation_of`: A가 B의 기반
- `contrasts`: A와 B는 대비됨

### 2. 블로그 글 발행 (`posts/my-post.md`)
`published: true`로 설정하면 블로그 저널 뷰에 노출됩니다:

```markdown
---
id: 2026-09-17-my-first-post
title: "나의 첫 번째 학습 기록"
date: 2026-09-17
tags: [dev, thoughts]
domain: dev
references: [transformer, attention-mechanism]
published: true
---

본문 내용 작성...
```

---

## 🎨 도메인 색상 (Domain Tags)

| 도메인 | 라벨 | 색상 |
|---|---|---|
| `ai` | AI | `#6251b5` (바이올렛) |
| `dev` | 개발 & CS | `#2878a9` (블루) |
| `accounting` | 회계 | `#2d855f` (그린) |
| `economics` | 경제 & 통계 | `#c75b39` (테라코타) |
| `design` | 디자인 | `#b83f7d` (마젠타) |
| `startup` | 창업 | `#b7791f` (오커) |
| `english` | 영어 | `#16858b` (틸) |
| `other` | 기타 | `#78716c` (웜 그레이) |

---

## 🛠️ 유용한 단축키 및 팁

- `/` 키: 어디서든 즉시 온톨로지 검색창 열기
- `G` 키: D3 온톨로지 지식 그래프 뷰 열기
- 다이어그램 더블클릭 또는 상단 `[크게 보기]`: 전체화면 줌/팬 라이트박스 팝업 (마우스 휠로 확대/축소 가능)

---

## 📄 라이선스

MIT License. 누구나 자유롭게 포크하여 자신만의 지식 베이스를 구축할 수 있습니다.
