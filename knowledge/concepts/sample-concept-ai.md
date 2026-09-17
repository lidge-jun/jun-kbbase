---
id: sample-concept-ai
title: "인공지능과 어텐션 메커니즘(Attention Mechanism in AI)"
tags: [ai, deep-learning, sample]
domain: ai
relates_to:
  - id: getting-started
    relation: requires
  - id: sample-concept-systems
    relation: contrasts
created: 2026-09-17
---

## 한 줄 요약

어텐션 메커니즘(Attention Mechanism)은 인공 신경망이 문장을 처리할 때 **지금 가장 중요한 단어에 선택적으로 가중치를 높이는** 구조다.

```mermaid
flowchart LR
    A["입력 문장"] --> B["토큰화"]
    B --> C["임베딩 벡터"]
    C --> D["어텐션 연산"]
    D --> E["출력 생성"]
```

## 어떻게 연결되는가?

지식 베이스에서는 본문 안에서 다른 개념을 언급할 때 `[[getting-started|시작 가이드]]`처럼 위키링크를 넣으면 D3 온톨로지 그래프에 자동으로 연결선(Edge)이 생성됩니다.
