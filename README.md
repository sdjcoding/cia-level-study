# CIA Level Study

공인내부감사사(Certified Internal Auditor) 학습용 정적 웹사이트.

- 데스크톱에서 작성, **모바일 브라우저에서 학습**
- 플래시카드 / 4지선다 퀴즈 / 진도 추적
- 빌드 도구 없음 — Vanilla HTML / CSS / JS
- GitHub Pages 무료 호스팅

배포 URL: `https://sdjcoding.github.io/cia-level-study/` (Pages 활성화 후)

## 빠른 시작

### 로컬 실행
```bash
cd "CIA LEVEL STUDY"
python3 -m http.server 8000
# http://localhost:8000 접속
```

### 모바일에서 사용
1. 모바일 브라우저로 배포 URL 접속
2. iOS Safari: 공유 → "홈 화면에 추가" / Android Chrome: 메뉴 → "홈 화면에 추가"
3. 진도/오답은 해당 기기 LocalStorage에 저장됨 (PC↔모바일 동기화 안 됨)

## 디렉토리 구조

```
CIA LEVEL STUDY/
├── index.html          홈 (Part 1/2/3 카드)
├── flashcards.html     플래시카드 모드
├── quiz.html           퀴즈 모드
├── css/style.css       모바일 우선 + 다크모드
├── js/
│   ├── app.js          공통 (Storage, Progress, Theme, Loader)
│   ├── flashcards.js
│   └── quiz.js
└── data/
    ├── manifest.json   Part 메타데이터
    ├── part1/
    │   ├── flashcards.json
    │   └── quiz.json
    ├── part2/   (비어있음 - 자료 추가 시 채움)
    └── part3/
```

## 학습 콘텐츠 추가하기

각 Part는 `data/part{N}/flashcards.json` 과 `data/part{N}/quiz.json` 두 파일로 구성됩니다. 파일이 없거나 비어있으면 홈에서 해당 버튼이 비활성화됩니다.

### 플래시카드 스키마

`data/partN/flashcards.json`

```json
{
  "part": 1,
  "title": "Part 1 - Essentials of Internal Auditing",
  "cards": [
    {
      "id": "p1-001",
      "category": "독립성과 객관성",
      "front": "질문 또는 용어",
      "back": "답변 또는 정의",
      "tags": ["독립성", "지배구조"]
    }
  ]
}
```

| 필드 | 필수 | 설명 |
|---|---|---|
| `id` | ✓ | 카드 고유 ID (진도 추적용 — 변경 금지 권장) |
| `category` |   | 화면 상단 카테고리 표시 |
| `front` | ✓ | 카드 앞면 (질문) |
| `back` | ✓ | 카드 뒷면 (답) |
| `tags` |   | 태그 배열 (뒷면 하단 표시) |

### 퀴즈 스키마

`data/partN/quiz.json`

```json
{
  "part": 1,
  "title": "Part 1 - Essentials of Internal Auditing",
  "questions": [
    {
      "id": "p1-q-001",
      "question": "문제 본문",
      "options": ["보기 1", "보기 2", "보기 3", "보기 4"],
      "answer": 2,
      "explanation": "정답 해설"
    }
  ]
}
```

| 필드 | 필수 | 설명 |
|---|---|---|
| `id` | ✓ | 문제 고유 ID (오답 추적용) |
| `question` | ✓ | 문제 본문 |
| `options` | ✓ | 보기 배열 (보통 4개) |
| `answer` | ✓ | 정답 인덱스 (0부터 시작) |
| `explanation` |   | 해설 (정답 클릭 후 표시) |

### 추가 후 반영
1. JSON 저장 → `git commit && git push`
2. GitHub Pages가 1~2분 안에 자동 빌드/배포
3. 모바일 브라우저에서 새로고침

## LocalStorage 키

| 키 | 내용 |
|---|---|
| `cia:progress:partN` | `{ studied: [...], known: [...] }` |
| `cia:quiz:partN:wrong` | 오답 문제 ID 배열 |
| `cia:settings` | `{ theme: "dark"|"light" }` |

홈 카드의 "진도 초기화" 또는 플래시카드 화면 하단의 "진도 초기화" 버튼으로 리셋 가능.

## CIA 시험 구조

- **Part 1**: Essentials of Internal Auditing — 내부감사 기초 (IIA 표준, 독립성, 객관성, 위험관리, 통제, 부정 등)
- **Part 2**: Practice of Internal Auditing — 감사 실무 (계획, 수행, 보고, 후속조치)
- **Part 3**: Business Knowledge for Internal Auditing — 비즈니스 지식 (지배구조, IT, 재무, 비즈니스 환경)

## 라이선스

학습용 개인 프로젝트. 콘텐츠는 IIA 표준을 참고한 한국어 요약이며, 공식 시험 자료가 아닙니다.
