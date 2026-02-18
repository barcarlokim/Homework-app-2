# Homework App 2 (v1 + v2 통합)

## 통합 포인트
- **v1 장점**: 선생님/학생 흐름이 분리된 다중 페이지 UX(과제 제안 → 제출 → 피드백 → 공간 꾸미기)
- **v2 장점**: API + DB 기반 구조(멀티 클라이언트 공유 가능), 보안 비밀번호 저장
- 이번 버전은 두 장점을 합쳐서 **Desktop 다중 페이지 UX + Mobile 분리 UI + 공통 API/DB**로 동작합니다.

## 실행
```bash
npm start
```
- API: `http://localhost:3000/api/...`
- Desktop: `http://localhost:3000/desktop/index.html`
- Mobile: `http://localhost:3000/mobile/index.html`

## 비밀번호 저장 방식
- 평문 저장 금지
- `PBKDF2(sha512, salt, 120000)` 해시를 `salt:hash` 형태로 저장

## DB 필드 매핑
요청 필드:
- 이름: `users.name`
- 선생님/학생 구분: `users.role`
- 아이디: `users.username`
- 비밀번호: `users.passwordHash` (해시 저장)
- 숙제구분번호: `homeworks.homeworkNumber`
- 숙제내용: `homeworks.content`
- 숙제횟수: `homeworks.count`
- 숙제기한: `homeworks.deadline`
- 피드백: `feedbacks.feedback`

추가 권장 필드:
- `createdAt`, `updatedAt`, `lastLoginAt`
- `submission.status`(제출/검토/수정요청)
- `feedback.rating`(정량평가)
- `deviceId`, `pushToken`(모바일 알림)

## 학생 공간 꾸미기
- 피드백 별점을 누적(`studentProfiles.stars`)
- 별점으로 `desk1` 구매/배치 (`inventory`, `placed`)
