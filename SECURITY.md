# 보안 점검 및 개선 기록

점검·수정일: **2026-11-05 (KST)**. 대상: Mark_md의 Next.js 정적 프런트엔드, Tauri/Rust 데스크톱, npm/Cargo 의존성, 파일 저장, Git 이력, GitHub 설정과 배포 워크플로.

**확인된 애플리케이션 결함을 수정했으며, npm 감사는 24개 경고에서 0개로 감소했다.** 파일 접근·저장 및 렌더링 회귀 테스트, 실제 브라우저 PDF/DOCX 내보내기, macOS 앱 실행을 검증했다. 인증서가 필요한 배포 서명과 Windows 실기기 검증까지 완료했다고 주장하지 않는다.

기준 커밋은 `359c81d2985253c585815db4b49f392a8a2c79d1`이며, 이번 수정은 그 이후 작업 트리의 변경이다. [원래 감사 보고서](docs/security-audit-2026-11-05.md)는 수정 전 재현과 공식 권고의 근거로 보존한다. 이 문서는 현재 조치 상태를 기록한다.

## 발견 사항별 조치

| 항목 | 수정 전 위험 | 적용한 조치 | 상태·검증 |
| --- | --- | --- | --- |
| SEC-01 · 높음 | PDF 변환 중 원문 이벤트 핸들러 실행 | 미리보기와 PDF에 공통 허용 목록 기반 HTML 정화 적용. DOM 삽입 전에 실행 태그·이벤트 제거 | 수정. 같은 무해한 페이로드로 PDF 생성 후 실행 **0회** 확인; 이전 1회 |
| SEC-02 · 높음 | 임의 경로 읽기·쓰기, 심볼릭 링크, 폴더 전체 asset 접근 | Rust가 OS 열기/네이티브 선택 창에서만 세션별 문서 ID 발급. IPC는 ID만 수용. 승인 폴더의 열린 핸들로 제한된 I/O, 최종 심볼릭 링크 거부. asset protocol 제거 | 수정. 미승인 ID, 링크 교체, 상위 폴더 교체, 경로 이탈, 권한 회수 테스트 통과 |
| SEC-03 · 중간 | CSP 비활성화 | Tauri CSP 활성화. 정적 HTML의 실제 인라인 스크립트 해시를 빌드 시 생성. 네트워크·스크립트·프레임·객체·폼 제한 | 수정. 브라우저 및 macOS 앱에서 워커와 화면 실행 확인. production의 script-src에 unsafe-inline/unsafe-eval 없음 |
| SEC-04 · 중간 | 문서 CSS가 앱 전체 화면에 적용 | 원문 style 태그, style/class/id/name 속성, SVG/MathML/iframe/form 제거. 필요한 표 셀 병합 속성 유지 | 수정. 원문 CSS의 body 적용 없음, 병합 표 표시 확인 |
| SEC-05 · 중간 | 보안 패치가 뒤처진 의존성·개발 서버 노출 | npm/Cargo 잠금 파일 갱신, Next·DOMPurify·PostCSS·Tokio 패치, 개발 서버를 127.0.0.1에 바인딩 | 수정. npm 감사 0건. Rust 잠금 파일 경고 5건의 플랫폼 적용 범위를 아래에 명시 |
| SEC-06 · 낮음 | javascript/file 등의 링크가 DOCX에 남음 | 공통 URL 정책으로 http/https/mailto만 허용. 나머지는 일반 텍스트 | 수정. 실제 DOCX의 외부 관계 XML에는 https 링크만 남음 |
| 외부 이미지·폰트 | 열람 시 원격 요청·추적 가능 | 모든 원격 이미지와 원문 data 이미지 차단. Google Fonts 요청 제거, 시스템 폰트 사용 | 수정. 재현 문서 열기·PDF 변환 중 추적 이미지 요청 0회 |
| 로컬 이미지 | 폴더 전체 파일 노출·경로 이탈 | 승인 문서 폴더 안의 상대 경로만 Rust에서 읽고 PNG/JPEG/WebP 실데이터·크기·해상도 검사 후 data URL 반환 | 수정. traversal/UNC/drive/alternate stream/위장 이미지 차단 테스트; macOS 앱의 상대 이미지 표시 확인 |
| 로컬 사본 | 내용·원본 경로가 영구 저장됨 | 저장 사본에서 원본 경로와 네이티브 권한 제거. 새 사용자 기본값은 세션 보관. 명시적 보관 설정과 전체 사본 삭제 기능 | 개선. 기존 사용자 사본은 임의 삭제하지 않음. IndexedDB와 legacy localStorage 삭제 확인. 앱 자체 암호화는 없음 |
| 저장 무결성 | 파일을 바로 덮어써 충돌·중단 피해 발생 | 기존 내용 SHA-256 확인, 제한된 폴더의 임시 파일에 기록·sync 후 교체, 기존 권한 보존 | 개선. 실제 macOS에서 외부 편집 후 저장 거절 및 외부 내용 보존 확인 |
| 자원 제한 | 무제한 읽기·파싱·PDF 생성 | 파일/이미지/사본 크기 제한, 파서 워커 5초 중단, PDF 페이지·시간 제한 | 개선. UTF-8 바이트·큰 파일·워커 timeout/취소 테스트 추가 |
| CI·공급망 | 보안 검사가 없고 Action 참조가 가변 태그 | npm audit, 플랫폼별 Rust 감사, Gitleaks, 회귀 테스트, 주간 검사. 외부 Action을 커밋 SHA로 고정 | 파일 구성 및 로컬 검증 완료. 변경 파일이 원격에 반영되면 신규 워크플로가 실행됨 |
| GitHub 운영 | main 보호·Dependabot 보안 수정 비활성화 | 자동 보안 업데이트 활성화. main PR·필수 검사·최신 베이스·선형 이력·대화 해결 요구, force push/삭제 차단, 관리자에도 적용 | GitHub API로 적용·재확인 완료 |
| 배포 서명 | 인증서·공증 없이 설치 파일 생성 | 일반 CI 산출물을 unsigned-test로 표시. 별도 서명 후보 빌드에 자격증명 사전 검사·서명/공증 검증 추가 | 구성 완료, **실제 서명 미완료**. 인증서/Secrets가 필요하며 없으면 서명 빌드 실패 |

## 2차 점검 및 추가 조치 (2026-11-05)

1차 수정 이후 작업 트리를 다시 점검했다. 재점검 명령, CSP 해시 대조, Action SHA·GitHub 설정 대조, 정화기 XSS/mXSS 페이로드 18종 시험에서 새 높음 등급 결함은 없었다. 다음 항목을 추가로 조치했다.

| 항목 | 위험 | 조치 | 검증 |
| --- | --- | --- | --- |
| 공개 main 미반영 | 원격 main이 기준 커밋 그대로였다. 열린 Dependabot 경고 55건(critical 6건)이 모두 로컬에서만 해소된 상태 | 1차·2차 수정을 작업 브랜치 PR로 게시 | 열린 경고 55건이 모두 로컬 잠금 파일 버전에서 해소됨을 대조 |
| macOS 단일 인스턴스 소켓 | 플러그인이 공유 `/tmp`의 고정 이름 소켓을 사용. 같은 Mac의 다른 계정이 먼저 만들면 실행 인자·작업 경로가 그 계정에 전송되고 앱이 종료됨 | 플러그인을 Windows/Linux에만 적용. macOS는 LaunchServices의 단일 인스턴스와 `RunEvent::Opened` 사용 | 플러그인 소스 분석. 다른 계정으로 재현하지는 않음. macOS 의존성 트리에서 제외 |
| 메인 스레드 디스크 I/O·이미지 재읽기 | 동기 명령은 메인 스레드에서 실행됨. 편집할 때마다 최대 32 MiB 이미지를 잠금을 쥔 채 다시 읽음 | 읽기·저장·이미지 명령을 blocking pool에서 실행. 이미지는 복제한 디렉터리 핸들로 잠금 밖에서 읽음. 프런트엔드는 문서별 이미지 목록이 바뀔 때만 다시 읽고 최근 4개 문서만 캐시 | 캐시 단위 테스트(20회 편집에 읽기 1회). Tauri mock IPC로 실제 권한 설정 아래 읽기·이미지·저장 명령 확인 |
| 내보내기 IPC 크기 | 바이트를 JSON 숫자 배열로 보내 32 MiB가 1.14억 자 JSON이 됨. 64 MiB 한도에 사실상 도달 불가 | raw IPC body와 percent-encoding한 파일명 헤더 사용 | Rust 파일명·형식 검사 테스트, mock IPC로 JSON 본문 거절·헤더 검증, 프런트엔드 raw body 테스트 |
| 서명 자격증명 노출면 | 서명 잡에서 설치 스크립트와 `cargo install`이 서명 단계보다 먼저 실행됨 | 테스트·감사는 release 환경이 없는 `verify` 잡으로 분리. 서명 잡은 `npm ci --ignore-scripts` 사용 | actionlint 0건. `--ignore-scripts` 설치로 production 빌드와 Tauri CLI 실행 확인 |
| Actions 정책 | 모든 Action 허용, SHA 고정 미강제 | 저장소 정책: SHA 고정 필수, GitHub 소유와 `dtolnay/rust-toolchain`, `Swatinem/rust-cache`만 허용 | GitHub API로 적용·재조회 |
| macOS 파일 연결 | `public.plain-text`를 Owner로 선언해 `.txt`·소스 파일 기본 앱을 가로챌 수 있음. 앱은 `.md` 외 파일을 열지 않음 | `net.daringfireball.markdown`만 Default 등급으로 선언 | 생성된 Info.plist 확인 |
| 최소 macOS | 기본값 10.13. WebKit 보안 업데이트가 끝난 OS에서 신뢰할 수 없는 문서를 렌더링 | `minimumSystemVersion` 14.0 | 생성된 Info.plist 확인 |
| 선택 일부 실패 | 여러 파일 중 하나가 실패하면 앞서 발급한 ID가 프런트엔드에 전달되지 않은 채 남음 | 전체 선택을 먼저 검증한 뒤 ID 발급. 실패 시 아무 ID도 발급하지 않고 기존 문서 권한 유지. 오류에 파일명 표시 | Rust 테스트 2개 |
| 재열기 시 편집 손실 | 외부 수정 충돌 안내대로 다시 열면 저장되지 않은 편집이 경고 없이 버려짐 | 디스크 내용으로 다시 열고, 미저장 편집은 파일에 연결되지 않은 `(unsaved edits)` 초안으로 보존 | 단위 테스트 2개 |
| 잠금 오염 | 파일 열기 이벤트에서 `lock().unwrap()`이 패닉할 수 있음 | 오류로 처리해 실패 시 접근을 막음 | 컴파일·테스트 |

데스크톱 앱의 링크는 wry 기본 동작상 macOS·Windows 모두 새 창 생성이 거부된다. 원격 페이지가 앱 안에서 열리지 않으므로 안전하지만, 링크를 눌러도 동작하지 않는다. 시스템 브라우저로 여는 기능을 추가하더라도 공통 URL 정책을 유지하고 앱 WebView 안에서는 열지 않는다. Windows에서는 문서를 연 동안 그 폴더의 이름 변경·삭제가 막힌다. cap-std가 디렉터리를 삭제 공유 없이 열기 때문이며, 이것이 상위 폴더 교체 방어의 근거다.

## 파일·문서 처리 경계

- 파일을 직접 여는 OS 이벤트, Import 및 Save 대화상자만 권한을 만들 수 있다. 프런트엔드나 IndexedDB에 적힌 경로는 권한이 아니다. 재시작 후 저장 사본을 원본에 다시 연결하려면 Import로 직접 열어야 한다.
- Rust의 `Documents`는 UUID와 열린 디렉터리 핸들을 세션 동안 관리한다. 닫은 문서의 권한을 회수하고, 사용자 정의 IPC 명령도 main 창에 명시적으로 허용한다. 프런트엔드에 event emit, shell, 임의 파일시스템 플러그인 권한을 부여하지 않는다.
- `.txt` 가져오기는 사본이며 원본을 덮어쓰지 않는다. 새 Markdown 저장·PDF·DOCX는 네이티브 Save 대화상자가 필요하다. 저장 경로의 파일 형식과 크기를 다시 확인한다.
- 파일 최종 구성요소의 링크를 따라가지 않으며 부모 디렉터리가 교체돼도 기존에 승인한 디렉터리 핸들을 사용한다. 임시 파일 교체는 링크 대상 대신 디렉터리 항목 자체를 교체한다.
- 외부 프로그램과의 모든 동시 쓰기를 원자적 비교·교체 트랜잭션으로 보장하는 것은 아니다. 마지막 충돌 검사와 교체 사이에 다른 작성자가 개입할 여지는 남는다. 일반적인 외부 수정은 감지·차단한다.
- 로컬 이미지의 `..`, 절대 경로, 외부 URL, SVG/GIF, 원문 data URL은 표시하지 않는다. 필요한 이미지는 문서와 같은 폴더 또는 하위 폴더에 PNG/JPEG/WebP로 둔다. 차단된 이미지는 안내 문구로 표시한다.
- 문서 원문 CSS는 보존하지 않는다. 앱이 제공하는 표 서식, `rowspan`/`colspan`, 줄바꿈은 유지한다. 링크는 새 창과 `noopener noreferrer`로 처리한다.

관련 코드: [네이티브 문서 권한](src-tauri/src/documents.rs), [IPC 명령](src-tauri/src/lib.rs), [HTML·URL 정책](src/lib/documentSecurity.ts), [내보내기](src/lib/markdownExport.ts), [보관·삭제](src/lib/documentStore.ts).

## 적용한 제한

| 항목 | 한도 |
| --- | --- |
| 문서 읽기·편집·원본 저장 | UTF-8 8 MiB |
| 라이브러리/네이티브 승인 문서 | 128개 |
| 영구 보관하는 문서 내용 합계 | 32 MiB |
| 파싱 | 워커 5초; 문서 변경 시 이전 작업 종료 |
| 생성 HTML | 32 Mi 문자 상한; DOM 작업은 메인 스레드에서 수행 |
| 로컬 이미지 | 문서당 64개, 개별 8 MiB·1,600만 화소, 원본 바이트 합계 32 MiB |
| PDF | 200페이지, 페이지 사이에서 총 60초 확인 |
| 내보내기 파일 | 64 MiB; Markdown은 8 MiB |

이 제한은 과도한 자원 사용을 줄인다. WebView 이미지 디코더·메인 스레드의 DOM/캔버스 처리에 대한 완전한 메모리 격리나 실시간 중단을 보장하지는 않는다. PDF의 단일 페이지 렌더링 도중에는 시간 제한을 검사하지 못할 수 있다.

## 의존성 재점검

2026-11-05 기준 npm 전체 및 production 감사에서 **0건**을 확인했다. 주요 버전은 Next/ESLint config 16.4.5, DOMPurify 3.4.17, PostCSS 8.5.32, React 19.3.1, Vitest 5.1.0, Tauri 2.12.5, Tokio 1.54.1이다. 실제 버전의 기준은 잠금 파일이다.

PostCSS의 취약 고정 버전을 교체했다. `@typescript-eslint/typescript-estree`가 사용하는 minimatch만 11.0.1 이상으로 제한했다. 구형 minimatch API를 사용하는 다른 ESLint 플러그인까지 강제로 올리지 않았으며 lint·빌드·테스트로 호환성을 확인했다.

Rust 감사의 `vulnerabilities`는 0건이고 다음 경고는 잠금 파일에 남는다. 두 지원 대상의 `cargo tree --target`에서 모두 제외됨을 확인했다. Linux는 지원 배포 대상이 아니다.

| 경고 | 패키지 | 처리 |
| --- | --- | --- |
| RUSTSEC-2024-0370 · unmaintained | proc-macro-error 1.0.4 | Linux GTK 경로, 상류 교체 추적 |
| RUSTSEC-2024-0429 · unsound | glib 0.18.5 | Linux GTK 경로, Linux 지원 전 해결 필요 |
| RUSTSEC-2026-0370 · unmaintained | zvariant 5.15.1 | Linux portal 경로, 상류 교체 추적 |
| RUSTSEC-2026-0371 · unmaintained | zbus_names 4.3.5 | Linux portal 경로, 상류 교체 추적 |
| RUSTSEC-2026-0372 · unmaintained | zvariant_derive 5.15.1 | Linux portal 경로, 상류 교체 추적 |

[audit-rust.py](scripts/audit-rust.py)는 이 ID들이 **두 지원 플랫폼에서 실제로 사용되지 않는지 매 실행마다 확인**한다. 신규 경고·알려진 취약점·지원 플랫폼에 들어온 예외 패키지는 실패 처리한다. 감사 경고를 전역으로 무시하지 않는다. 이전의 Tokio unsound, async-executor yanked, unic 계열 경고는 업데이트로 해소됐다.

## 검증 기록

- Vitest: **69개 테스트**. HTML/CSS/XSS, 링크, DOCX 관계 XML, 실제 PDF DOM 삽입 전 정화, 원본 경로 제거, 사본 삭제 순서, 손상/초과 라이브러리 보존, 재개방 시 이전 저장 권한 재사용 차단, 문서 크기, 파서 중단, 기존 파서·경로·PDF 분할·저장 순서, 이미지 캐시, 재열기 시 미저장 편집 보존, raw 내보내기 IPC 테스트.
- Rust: **16개 테스트**. 정상 승인/읽기/저장/회수, 임의 ID 거절, 링크·상위 폴더 교체, 외부 수정 충돌, 파일 크기, `.txt` 쓰기 거절, 이미지 경계, 선택 전체 검증·용량 계산, 내보내기 파일명·형식 검사. Tauri mock 런타임으로 실제 capability ACL을 거쳐 문서·이미지·저장 명령, raw 내보내기 본문, 원격 출처 거부를 확인.
- ESLint, TypeScript/production 정적 빌드, macOS `.app` 빌드 통과. GitHub Actions YAML은 actionlint 1.7.12로 검증.
- JavaScriptCore: 712,000자 출력이 기준 파서와 일치, 확인 실행에서 149 ms.
- Chromium 실제 UI: 같은 악성 입력의 미리보기·PDF에서 스크립트 실행 0회, 원문 CSS 전역 적용 없음, 외부 추적 이미지 요청 0회. PDF 생성 성공. DOCX 링크 관계는 안전한 https 링크만 포함.
- Chromium 실제 UI: 새 origin의 기본 보관 꺼짐, 보관 활성화 후 IndexedDB 저장, Clear saved copies 후 IndexedDB 및 legacy localStorage 내용 삭제를 확인.
- macOS 실제 `.app`: 명령행 문서 열기, CSP 아래 파서 워커 실행, 상대 이미지 표시, 편집 후 원본 저장, 외부 수정 뒤 Save failed와 외부 내용 보존 확인. 감사용 임시 파일만 편집했다.
- Gitleaks: Git 이력과 수정 소스에서 비밀정보 검출 없음. 탐지 규칙 밖의 모든 비밀정보가 없다는 보장은 아니다.
- **Windows 실행 검증은 미완료**다. 플랫폼별 빌드/테스트 워크플로와 [Windows 체크리스트](docs/windows-testing.md)를 유지한다. 이 커밋의 Windows 설치·WebView2·파일 열기/저장·junction 동작은 Windows 환경에서 확인해야 한다.

원시 감사 JSON·PDF·DOCX·재현 자료는 `/tmp/markmd-security-audit-2026-11-05/`에 보관했다. 임시 파일은 OS에 의해 정리될 수 있으며 핵심 결과는 이 문서에 기록했다.

## GitHub와 배포

원격 적용을 확인한 설정:

- Dependabot vulnerability alerts 및 자동 보안 업데이트 활성화.
- `main`: PR 필수, 필수 검사 `Windows x64`, `macOS Apple Silicon`, `Security checks`, 최신 base 요구, 관리자 적용, force push·삭제 금지, 선형 이력·대화 해결 요구. 단독 운영을 고려해 타인의 필수 승인 수는 0이다.
- `release` 환경은 보호 브랜치만 허용한다. 서명 워크플로는 main에서 수동 실행하며 OS 런타임 체크리스트 통과 입력을 요구한다.
- 기존 Secret scanning·push protection·Actions read 권한은 유지한다.
- Actions 정책: 전체 SHA 고정 필수. GitHub 소유 Action과 `dtolnay/rust-toolchain`, `Swatinem/rust-cache`만 허용. 새 외부 Action을 쓰려면 이 허용 목록을 먼저 갱신한다.

보안 수정, CI, Dependabot 설정은 작업 브랜치 PR로 게시한다. 필수 검사를 통과한 뒤 병합해야 main에 반영되며, main 직접 푸시는 차단된다. 워크플로 파일 구성과 실제 원격 실행 성공을 혼동하지 않는다.

일반 [desktop.yml](.github/workflows/desktop.yml)은 테스트용 unsigned-test 산출물을 만든다. [signed-release.yml](.github/workflows/signed-release.yml)은 인증서가 없거나 서명/공증 검증이 실패하면 서명 산출물을 업로드하지 않는다. 어느 워크플로도 GitHub Release에 자동 공개하지 않는다.

서명 후보 빌드를 사용하려면 GitHub `release` 환경에 다음을 설정한다. 인증서/비밀번호는 저장소·채팅에 기록하지 않는다.

| 대상 | 필요한 Secrets / Variables |
| --- | --- |
| macOS Secrets | APPLE_CERTIFICATE, APPLE_CERTIFICATE_PASSWORD, APPLE_SIGNING_IDENTITY (Developer ID Application), APPLE_ID, APPLE_PASSWORD (앱 전용), APPLE_TEAM_ID |
| Windows Secrets | WINDOWS_CERTIFICATE (base64 PFX), WINDOWS_CERTIFICATE_PASSWORD |
| Windows Variable | WINDOWS_TIMESTAMP_URL (인증서 발급기관의 RFC 3161 서버) |

현재 등록된 서명 자격증명은 확인되지 않았다. 인증서 없이 로컬 자체 서명을 배포자 인증으로 표시하지 않는다. 서명 워크플로의 실제 성공, Apple 공증 및 Windows Authenticode 검증은 자격증명을 등록한 이후 확인해야 한다. [Tauri macOS 공식 안내](https://v2.tauri.app/distribute/sign/macos/), [Windows 공식 안내](https://v2.tauri.app/distribute/sign/windows/).

## 운영과 재점검

```bash
npm ci
npm audit --audit-level=low
npm test
npm run lint
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo test --manifest-path src-tauri/Cargo.toml --locked --lib
# cargo-audit 0.22.2 설치 후
python3 scripts/audit-rust.py
npm run test:webkit  # macOS
```

정적 웹 배포에서는 빌드가 만든 `out/_headers`를 호스팅에 적용한다. 이 파일을 지원하지 않는 호스팅은 동등한 HTTP 헤더를 별도로 설정해야 한다. HTML meta CSP는 유지되지만 `frame-ancestors`, X-Frame-Options, nosniff 등 응답 헤더를 대신하지 못한다. 개발 CSP의 unsafe-inline/unsafe-eval은 개발 도구에만 한정한다. 제품 UI와 PDF 레이아웃에 필요한 style-src unsafe-inline은 유지하되 문서 원문 스타일은 정화 단계에서 제거한다. [Tauri CSP 동작](https://v2.tauri.app/security/csp/).

민감한 문서는 Keep drafts after closing을 끄고 원본 파일로 관리한다. 로컬 사본을 보관하면 OS 계정·FileVault/BitLocker 등 디스크 보호에 의존한다. 앱 전용 암호화를 구현한 상태는 아니다. 라이브러리에서 지운 사본이나 디스크 임시 파일에 대해 저장 매체의 포렌식 복구 불가능성까지 보장하지 않는다.

향후 의존성·코드·지원 플랫폼 변경 시 이 점검을 반복한다. 새로운 보안 결함은 공개 이슈에 공격 가능한 원문이나 비밀정보를 붙이기 전에 저장소 관리자에게 비공개로 전달한다.
