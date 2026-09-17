---
id: sample-concept-systems
title: "시스템 프로그래밍과 메모리 모델(Systems Programming and Memory)"
tags: [dev, systems, rust, sample]
domain: dev
relates_to:
  - id: getting-started
    relation: requires
  - id: sample-concept-ai
    relation: contrasts
created: 2026-09-17
---

## 한 줄 요약

컴퓨터 하드웨어의 물리 법칙(CPU 캐시, 메모리 대역폭)을 제어하기 위해 C, C++, Rust 같은 시스템 언어는 메모리 제어 권한을 프로그래머와 컴파일러에게 위임한다.

## 시스템과 AI의 연결

[[getting-started|시작 가이드]]에서 다룬 것처럼, 거대한 인공지능 모델([[sample-concept-ai|어텐션 메커니즘]]) 역시 밑바닥에서는 GPU 메모리와 고속 C-ABI 바인딩 위에서 작동합니다.
