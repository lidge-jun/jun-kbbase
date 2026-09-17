---
id: getting-started
title: "지식 베이스 시작하기(Getting Started with Knowledge Base)"
tags: [guide, onboarding, system]
domain: dev
relates_to:
  - id: sample-concept-ai
    relation: foundation_of
  - id: sample-concept-systems
    relation: foundation_of
created: 2026-09-17
---

## 환영합니다!

이 저장소는 **개인 맞춤형 온톨로지 학습 지식 베이스이자 발행 가능한 정적/동적 개발 블로그**입니다.

복잡한 노션(Notion)이나 옵시디언(Obsidian)처럼 무거운 앱에 의존하지 않고, **순수 마크다운(Markdown) 파일들**을 단일 Node.js 내장 서버로 파싱하여 미려한 Japandi 미네랄 페이퍼 디자인과 지식 그래프로 시각화합니다.

## 핵심 기능

1. **온톨로지 지식 연결**: Frontmatter의 `relates_to`와 본문 내 `[[id|위키링크]]` 문법을 통해 모든 개념이 D3 지식 그래프로 자동 엮입니다.
2. **수식 및 다이어그램 완벽 지원**:
   - KaTeX 수식: $E = mc^2$ 및 독립 수식 $$ \operatorname{Attention}(Q, K, V) = \operatorname{softmax}\left(\frac{QK^T}{\sqrt{d_k}}\right)V $$
   - Mermaid 다이어그램: 가로 스크롤 보호 래퍼 및 `[크게 보기]` 전체화면 라이트박스 줌/팬 모달 지원.
3. **인터랙티브 HTML 시각화 지원**: 슬라이더, 캔버스 등 직접 조작하는 학습 위젯을 `site/assets/interactive/`에 넣어 `<iframe>`으로 임베드 가능.
4. **Vditor WYSIWYG 에디터 내장**: 웹 브라우저 화면에서 즉시 `수정` 버튼을 눌러 마크다운을 편집하고 라이브 프리뷰로 확인 가능.

## 디렉토리 구조

```text
knowledge/
  concepts/        # 학습 개념 노드 (.md)
  questions/       # Q&A 메모 (.md)
posts/             # 블로그 발행 글 (.md, published: true)
  draft/           # 미발행 초안
site/              # Vanilla JS SPA 웹 프론트엔드
  assets/          # 이미지 및 대화형 인터랙티브 HTML 위젯
build.js           # 마크다운 -> 온톨로지 그래프 JSON 빌더
server.js          # 로컬 개발 및 API 서버 (포트 3456)
```
