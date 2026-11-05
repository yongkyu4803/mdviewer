# Mark_md 보안 점검 — 2026-11-05

> 이 문서는 수정 전 상태의 감사 기록이다. 후속 수정·재검증 결과와 운영 지침은 프로젝트 루트의 [SECURITY.md](../SECURITY.md)를 기준으로 확인한다.

**판정: 외부 배포 확대 전에 PDF 내보내기 XSS와 네이티브 파일 접근 경계를 우선 수정해야 한다.**

점검 기준은 커밋 `359c81d2985253c585815db4b49f392a8a2c79d1`이다. 애플리케이션 소스, 설정, 의존성 잠금 파일, Git 이력, GitHub 저장소 설정을 확인했다. 이 보고서 작성 외에 제품 코드·의존성·원격 설정은 변경하지 않았다. 발견 항목은 아래처럼 실제 재현, 코드 확인, 의존성 경고를 구분한다.

| 구분 | 주요 결과 | 판단 |
| --- | --- | --- |
| 높음 · SEC-01 | PDF 내보내기 시 Markdown의 이벤트 핸들러 실행 | 브라우저에서 재현 |
| 높음 · SEC-02 | 네이티브 파일 명령에 사용자 승인 경로 검증 없음 | 코드 확인, 저장 함수의 임시 파일 하네스 재현 |
| 중간 · SEC-03 | 데스크톱 CSP 비활성화 | 설정 확인; SEC-01의 방어층 부재 |
| 중간 · SEC-04 | 문서 CSS가 미리보기 밖의 앱 전체에 적용됨 | 브라우저에서 재현 |
| 중간 · SEC-05 | 보안 패치가 뒤처진 의존성과 개발 서버 노출 설정 | 잠금 파일·공식 권고 대조; 적용 조건별 구분 |
| 낮음 · SEC-06 | 미리보기에서 제거한 위험 URI가 DOCX 링크에 남음 | DOCX 내부 XML에서 재현; Word에서 실행된 것은 아님 |
| 개선 권고 | 외부 이미지 자동 요청, 로컬 문서 사본 보존, 배포 서명, CI 보안 검사·브랜치 보호 | 확인된 동작·설정과 위험 조건을 아래에 기재 |

위 우선순위는 프로젝트의 사용 방식에 대한 평가이며 CVSS 점수가 아니다. SEC-02는 프런트엔드가 침해됐을 때의 피해 확대 경로다. 각 항목을 독립적인 원격 공격 수단으로 합산해서 해석해서는 안 된다.

## 범위와 검증 방법

- 추적 파일 64개를 기준으로 `src/`, `src-tauri/`, 설정·테스트·스크립트·CI·문서를 검토했다.
- `npm audit --json`, `npm audit --omit=dev --json`으로 npm 의존성을 확인했다.
- cargo-audit로 `src-tauri/Cargo.lock`의 491개 의존성을 확인했다. RustSec DB 기준 커밋은 `965bf9ad083b58e6340d65829d85217b18be9290`, DB 갱신 시점은 `2026-11-03T21:34:28+01:00`이다.
- Gitleaks 8.30.1 공식 배포 파일의 SHA-256을 검증한 뒤 `git --log-opts=--all --redact=100`으로 이력을 검사했다. 도구가 검사한 커밋은 11개, 검사량은 약 634 KB다.
- 로컬 정적 빌드를 `127.0.0.1:3010`에만 제공하고 Ego Lite에서 무해한 문서로 재현했다. 이벤트 실행은 메모리의 숫자 표식으로만 확인했다.
- 네이티브 저장 검증은 현재 소스의 `write_markdown_file`과 확장자 검사 함수를 그대로 추출한 Rust 하네스로 수행했다. 변경한 파일은 감사용 임시 디렉터리에 직접 생성한 파일뿐이다.
- 원격 저장소·브랜치·Actions 설정은 GitHub API로 읽기만 했다.

실제 macOS/Windows WebView에서 악성 문서 → IPC → 파일 변경을 연결한 종단간 공격은 실행하지 않았다. Windows의 junction/reparse point, 배포된 웹 서비스의 HTTP 헤더, 운영체제·WebView 자체의 취약점은 이번 검증 범위에 포함하지 않았다. 원격 웹 서비스 URL은 제공되지 않았다.

## SEC-01 — PDF 내보내기에서 HTML 정화 누락

**높음 / 재현됨 / CWE-79**

근거: [markdownExport.ts](../src/lib/markdownExport.ts) 234–248행. `parseMarkdown(markdown)`의 출력을 정화하지 않고 `container.innerHTML`에 넣은 뒤 실제 문서에 추가한다. 반면 [markdownPreview.ts](../src/lib/markdownPreview.ts) 10행에서는 DOMPurify를 사용한다.

확인에 사용한 무해한 입력:

```html
<img src="data:image/png;base64,invalid"
     onerror="window.__markmdSecurityAudit=(window.__markmdSecurityAudit||0)+1">
```

동일 문서의 미리보기에서는 이벤트 속성이 제거되고 실행 횟수가 0이었다. Export → PDF를 선택한 뒤 실행 횟수가 1로 바뀌었으며 PDF도 생성됐다. 단순히 파서 출력에 위험 문자열이 남는 것에 그치지 않고, 현재 앱의 PDF 내보내기 동작에서 실행된 것이다.

공격자가 만든 문서를 사용자가 PDF로 내보내면 해당 페이지 권한으로 JavaScript가 실행된다. 웹에서는 해당 origin의 문서 저장소가 영향 범위에 포함된다. 데스크톱에서는 SEC-02와 결합하는 구조다. 실제 외부 전송이나 사용자 파일 침해는 시험하지 않았다.

**권고:** 미리보기와 PDF에 같은 HTML·URL 정화 정책을 적용한다. 이벤트 속성·실행 가능한 태그를 제거하고, 표의 `rowspan`/`colspan`처럼 필요한 문서 표현은 유지한다. `script` 태그만 제거하는 수정으로는 `onerror` 등 이벤트 핸들러를 차단할 수 없다. 내보내기 동작을 직접 실행하는 XSS 회귀 테스트를 추가한다.

Marked는 출력 HTML을 정화하지 않는다고 명시한다. 라이브러리 업데이트만으로 이 사용 코드의 결함이 해결되지는 않는다. [Marked 공식 문서](https://marked.js.org/#usage)

## SEC-02 — 네이티브 명령의 파일 승인·범위 검사 부재

**높음 / 코드 확인 및 저장 함수 재현 / CWE-862, CWE-59**

근거: [lib.rs](../src-tauri/src/lib.rs) 40–62행, 160–165행; [build.rs](../src-tauri/build.rs).

- `read_markdown_file(path)`는 경로를 정규화하고 확장자를 검사하지만, 사용자가 파일 선택 창이나 OS 열기를 통해 승인했는지는 확인하지 않는다. 호출자가 제공한 `.md`·`.markdown`·`.txt` 경로를 읽을 수 있는 구조다.
- `write_markdown_file(path, content)`도 승인 여부를 검사하지 않는다. 전달된 경로 문자열의 확장자만 검사한 뒤 `std::fs::write`를 호출한다.
- 저장 경로의 심볼릭 링크를 확인하지 않는다. macOS 감사 하네스에서 `alias.md`를 `non-markdown-fixture.txt`에 연결한 뒤 저장을 호출하자 대상 `.txt` 내용이 변경됐다. 파일 선택 이력이 없는 `.md`도 변경됐다.
- 읽기 성공 시 `allow_directory(directory, true)`로 상위 폴더와 하위 폴더를 asset protocol 범위에 추가한다. 이는 해당 문서의 이미지 파일 목록으로 제한된 권한이 아니다. 읽기 명령의 호출자가 승인되지 않은 경로를 지정할 수 있다는 점과 결합하면 이미지 이외의 파일 노출 범위도 넓어진다.

`core:default`만 설정했다고 사용자 정의 명령의 경로가 자동으로 제한되는 것은 아니다. Tauri는 앱에 등록된 사용자 정의 명령을 기본적으로 앱의 창·WebView에서 호출할 수 있게 하며, Rust 명령 내부의 잘못된 범위 검사를 capabilities가 대신 해결하지 않는다. [Tauri capabilities 문서](https://v2.tauri.app/security/capabilities/)

이는 OS 권한 상승을 의미하지 않는다. 앱 프로세스가 원래 접근할 수 있는 파일이 범위이며, 외부 웹 페이지가 IPC를 바로 호출할 수 있다는 뜻도 아니다. SEC-01처럼 앱의 로컬 문맥에서 코드를 실행할 수 있을 때 피해가 커지는 문제다. 심볼릭 링크 우회에는 해당 링크가 미리 존재하거나 다른 경로로 만들어졌다는 조건이 필요하다.

**권고:** OS 파일 열기·네이티브 선택 창에서 승인한 파일을 Rust 상태에 등록하고, 프런트엔드에는 문서 ID를 제공한다. 읽기·쓰기마다 ID와 권한을 검증하며 IndexedDB가 제공하는 경로를 승인 근거로 신뢰하지 않는다. 링크·정규화·파일 교체 경쟁 조건을 고려한 파일 열기를 적용한다. 이미지 권한도 필요한 파일 또는 제한된 이미지 폴더로 축소하고 문서 권한 수명을 관리한다.

## SEC-03 — Content Security Policy 비활성화

**중간 / 설정 확인 / 방어층 부재**

근거: [tauri.conf.json](../src-tauri/tauri.conf.json) 25행의 `"csp": null`.

HTML 정화가 누락됐을 때 인라인 스크립트·이벤트 실행과 외부 연결을 추가로 제한하는 CSP가 없다. CSP 부재만으로 공격이 성립한다고 판단한 것은 아니며, 실제 확인된 SEC-01의 영향을 줄일 방어층이 없는 상황이다.

**권고:** Tauri가 번들 코드에 적용하는 nonce/hash를 활용한 제한적인 `script-src`, IPC에 필요한 목적지만 허용하는 `connect-src`, 명시적인 `img-src`·`font-src`, `object-src 'none'`, 제한적인 `frame-src`·`base-uri`·`form-action`을 설계한다. Next.js 정적 번들과 macOS/Windows의 asset/IPC origin 차이를 함께 검증해야 한다. 인라인 이벤트를 다시 허용하는 `script-src 'unsafe-inline'`로 문제를 덮지 않는다. [Tauri CSP 문서](https://v2.tauri.app/security/csp/)

## SEC-04 — 문서 CSS의 앱 전체 적용

**중간 / 재현됨 / 화면 무결성**

근거: [markdownPreview.ts](../src/lib/markdownPreview.ts) 10–12행의 기본 DOMPurify 설정, [page.tsx](../src/app/page.tsx) 1003행의 동일 문서 내 HTML 삽입.

아래 내용을 미리보기로 표시하자 `document.body`의 계산된 CSS 변수 값이 `applied-from-document`로 바뀌었다. 정화 후에도 `style` 태그 1개가 남았다.

```html
<div><style>body { --markmd-security-audit: applied-from-document; }</style>
Harmless audit marker</div>
```

문서 CSS가 미리보기 영역 밖의 앱 UI를 선택할 수 있다. 악성 스타일로 버튼·안내문을 숨기거나 다른 내용을 덮어씌우는 화면 위장 가능성이 있다. 이번 검증에서는 화면을 숨기거나 입력 정보를 수집하지 않았다. HTML 정화와 CSS 격리는 별도 문제다.

**권고:** 문서의 `style` 태그와 무제한 인라인 스타일을 제거하거나, 허용할 CSS 속성을 별도로 검증한다. 필요한 표 서식은 앱이 제어하는 클래스·제한된 속성으로 표현한다. 스타일 보존이 꼭 필요하면 신뢰 경계가 분리된 렌더링 영역을 검토한다.

## SEC-05 — 의존성 보안 패치와 개발 환경

**중간 / 알려진 권고와 버전 일치 / 악용 가능성은 조건별 판단**

2026-11-05 저장한 npm 감사 결과:

| 검사 | Critical | High | Moderate | Low | 합계 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 전체 의존성 | 2 | 9 | 12 | 1 | 24 |
| `--omit=dev` | 2 | 4 | 1 | 0 | 7 |

숫자는 npm이 표시한 영향받는 패키지 항목 수다. 독립적인 취약점 수나 이 앱에서 재현된 공격 수가 아니다. npm의 `dependencies` 분류가 곧 데스크톱 실행 파일의 런타임 구성은 아니다. 일부 권고의 심각도는 npm 집계와 상류 프로젝트의 최신 페이지에서 다르게 표시되므로, 재현·사용 조건을 우선했다.

| 대상 | 잠긴 버전 | 현재 프로젝트의 적용 조건 | 권고 |
| --- | --- | --- | --- |
| DOMPurify | 3.4.14 | 검출 권고는 `IN_PLACE`, 특정 hook, `SAFE_FOR_TEMPLATES`, XHTML 설정 등과 관련. 앱은 문자열 입력과 `RETURN_DOM_FRAGMENT`를 사용하며 해당 조건은 확인되지 않음 | 3.4.17 이상으로 갱신하고 정화 회귀 테스트 수행 |
| Next.js | 16.2.6 | 데스크톱은 `output: 'export'`로 Node 서버를 포함하지 않음. 서버 Image Optimization·Server Actions·서버 캐시 RCE 경고를 그대로 데스크톱 RCE로 볼 수 없음. 개발 서버는 별도 영향 범위 | 확인한 안정 릴리스 16.4.5 및 호환되는 eslint-config-next로 갱신 검토 |
| PostCSS | 8.5.15 | 빌드 도구 경로. `overrides`가 취약 버전을 강제로 유지함 | `<=8.5.22`에 대한 권고를 해결하는 버전으로 override 제거·교체 후 재검사 |
| sharp | 0.34.5 | Next 서버 이미지 처리 경고와 연결. 현재 정적 앱에서는 서버 이미지 최적화 API를 제공하지 않음 | Next 업데이트와 함께 잠금 파일 갱신 |
| Vitest / Vite | 4.1.7 / 잠금 파일 기준 | 개발·테스트 도구. 현재 `vitest run`을 사용하며 앱 런타임 서버는 아님 | 호환 패치 버전으로 갱신; 개발 서버 외부 노출 방지 |

DOMPurify 적용 조건과 패치는 [공식 IN_PLACE 권고](https://github.com/cure53/DOMPurify/security/advisories/GHSA-6688-9rhm-gjv2), [후속 수정 권고](https://github.com/cure53/DOMPurify/security/advisories/GHSA-mrv2-3pqr-j5jr), [XHTML 조건 권고](https://github.com/cure53/DOMPurify/security/advisories/GHSA-c6gr-qvv4-5v3f)를 대조했다. Next의 서버 이미지 처리 조건은 [공식 SVG 권고](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw)에서 확인했다.

[package.json](../package.json) 6행은 `next dev -p 3006`이다. 설치된 Next.js CLI 문서에 따르면 기본 hostname은 `0.0.0.0`이다. 개발 서버를 실행하면 loopback만으로 제한되지 않으며 방화벽·네트워크 조건에 따라 다른 장치에서 접근할 수 있다. 또한 현재 버전에는 개발자가 방문한 악성 사이트에서 개발 정보가 노출될 수 있는 MCP endpoint 권고가 있다. 개발 서버를 loopback에 묶는 조치와 Next 패치가 모두 필요하며, loopback 바인딩만으로 악성 사이트의 origin 검사 문제까지 해결되는 것은 아니다. 실제 개발 서버 공격은 실행하지 않았다. [Next 개발 서버 권고](https://github.com/vercel/next.js/security/advisories/GHSA-39w2-rjm5-chcv)

RustSec 결과는 `vulnerabilities.count = 0`이지만 경고가 12개 있다.

- `unmaintained` 9개: proc-macro-error, unic 계열 5개, zbus_names, zvariant, zvariant_derive.
- `unsound` 2개: glib 0.18.5, tokio 1.53.1.
- `yanked` 1개: async-executor 1.14.0.

Tokio는 macOS 의존성 트리에 포함된다. `AsyncFd` 관련 [RUSTSEC-2026-0386](https://rustsec.org/advisories/RUSTSEC-2026-0386.html)은 1.53.3 이상 등에서 수정됐으므로 업데이트 검토가 필요하다. 앱 소스와 직접 확인한 Tauri 플러그인 코드에서는 해당 `AsyncFd` 호출이 발견되지 않았으며, 전이 의존성 전체의 도달 가능성은 추가 분석 대상이다. glib는 확인한 Windows 의존성 트리에는 포함되지 않았다. `cargo audit` 종료 코드 0만으로 이 경고를 무시해서는 안 된다.

**권고:** `npm audit fix --force`를 바로 적용하지 않는다. 도구가 제안한 eslint-config-next의 하위 메이저 버전 전환 등을 검토 없이 수용하면 프레임워크 버전이 어긋날 수 있다. 직접 의존성·override·잠금 파일을 함께 갱신하고 두 OS 빌드와 보안 회귀 테스트를 수행한다.

## SEC-06 — DOCX 링크 정책 불일치

**낮음 / 출력물에서 재현됨 / 후속 실행 영향은 확인 필요**

근거: [markdownExport.ts](../src/lib/markdownExport.ts) 82–84행, 319–320행. 원문 링크를 스킴 검사 없이 `ExternalHyperlink`에 전달한다.

`[unsafe link](javascript:alert%281%29)`는 미리보기에서 `<a>unsafe link</a>`로 정화됐지만, 내보낸 DOCX의 `word/_rels/document.xml.rels`에는 `Target="javascript:alert%281%29"`가 남았다. Word에서 해당 링크를 클릭하거나 코드를 실행한 것은 아니다. Office의 차단 동작·설정에 따라 실제 영향이 달라지므로 이를 확인된 코드 실행으로 보고하지 않는다.

**권고:** 미리보기와 내보내기에 공통 URL 정책을 적용한다. 기본적으로 `https`, `http`, 필요한 경우 `mailto` 등 명시적으로 허용한 스킴만 링크로 만들고 나머지는 일반 텍스트로 처리한다.

## 개인정보·배포·운영 개선 권고

| 항목 | 확인 내용 | 권고와 해석 |
| --- | --- | --- |
| 외부 이미지 | 승인 버튼 없이 다른 origin의 이미지 요청이 발생함. 감사에서는 `http://localhost:3010/...`으로만 검증 | 외부 이미지 차단/허용 설정과 도메인 표시. 문서 작성자가 수신자별 URL을 넣으면 열람 시점·접속 정보를 추적할 수 있음. 문서 전체 내용이 자동 전송된다는 뜻은 아님 |
| 외부 폰트 | globals.css 1행에 Google Fonts 원격 CSS import | 외부 통신 없는 모드가 필요하면 폰트 번들링 또는 시스템 폰트 사용 |
| 로컬 사본 | documentStore.ts가 내용 전체와 원본 경로를 IndexedDB, 실패 시 localStorage에 저장 | 보관 정책·전체 기록 삭제 기능 검토. 브라우저 프로필·OS 계정·디스크 보호 상태에 의존하며, 앱 자체 암호화는 없음 |
| 파일 무결성 | 원본 저장에 `std::fs::write` 사용; 파일 교체·외부 수정 충돌 검사 없음 | 임시 파일 후 원자적 교체, 실패 복구, 외부 변경 감지 검토. 충돌·전원 중단을 이번에 재현한 것은 아님 |
| 자원 제한 | 읽기 전 파일 크기 제한, 파싱·이미지 디코딩 제한이 없음 | 문서·이미지 크기 제한, 취소·시간 제한 검토. 메모리 고갈을 유발하는 부하 시험은 수행하지 않음 |
| 코드 서명 | 배포용 Windows 서명 및 Apple Developer 서명·공증 설정 없음 | 외부 배포 전 서명과 검증 절차 마련. 로컬 ad-hoc 서명과 배포자 인증은 구분 |
| CI 검사 | lint·일반 테스트·빌드는 있으나 npm/RustSec/secret scan 단계 없음 | 실제 실행 경로·허용 예외를 반영한 감사 단계와 정기 검사 추가 |
| Actions 참조 | 외부 Action이 `@v7`, `@v6`, `@stable`, `@v2` 등 변경 가능한 태그를 사용 | 검토한 커밋 SHA 고정과 자동 갱신 PR 검토 |
| 기본 브랜치 | GitHub API에서 `main.protected = false` | PR·필수 검사·force push 방지 규칙 검토. 저장소 운영 방식에 맞춰 설정 |
| 의존성 자동 패치 | `dependabot_security_updates.status = disabled` | 자동 보안 업데이트와 정기 버전 점검 활성화 검토 |

GitHub 설정은 점검 시점의 상태이며 변경하지 않았다. 저장소는 public이다. Secret scanning과 push protection은 enabled, 기본 workflow 권한은 read이고 PR 승인 권한은 false였다. 워크플로에도 `contents: read`가 설정되어 있다.

## 확인된 방어와 이상이 발견되지 않은 범위

- 일반 미리보기의 DOMPurify는 시험한 `onerror`와 `javascript:` 링크를 제거했다. 이는 모든 XSS 입력에 대한 안전 증명은 아니다.
- Gitleaks는 검사한 Git 이력에서 비밀정보 패턴을 발견하지 않았다. 탐지 규칙 밖의 자격증명까지 없다고 보장하는 결과는 아니다.
- Tauri asset scope는 처음부터 전역 허용되어 있지 않고 빈 배열로 시작한다. 다만 이후의 권한 확대 방식은 SEC-02의 수정 대상이다.
- 원격 origin에 Tauri capabilities를 부여한 설정은 발견되지 않았다. shell 실행 플러그인·임의 명령 실행 코드도 앱 소스에서 발견되지 않았다.
- 현재 앱에는 별도 로그인·DB·HTTP API 서버 구현이 없으며, 데스크톱은 정적 프런트엔드를 포함한다. 존재하지 않는 서버 기능을 근거로 인증·SQL injection 취약점을 주장하지 않았다.
- 직전 Windows/macOS 자동 빌드는 [성공](https://github.com/yongkyu4803/mdviewer/actions/runs/41796877754)했다. 해당 워크플로에는 보안 감사 단계가 없으므로 보안상 안전하다는 근거로 사용하지 않았다.

## 수정 순서와 완료 기준

1. **배포 전 우선:** SEC-01 PDF 정화, SEC-02 Rust 파일 승인 경계, SEC-03 CSP를 함께 수정한다. 외부 문서의 PDF 내보내기에서 이벤트 실행이 0이어야 하고, 승인되지 않은 경로·심볼릭 링크 우회가 거부돼야 한다.
2. **같은 수정 주기:** SEC-04 CSS 격리, SEC-06 URL 정책, 외부 리소스 정책을 적용한다. 문서 스타일이 앱 UI에 영향을 주지 않고 위험 URI가 DOCX에 남지 않아야 한다.
3. **의존성 정리:** DOMPurify·Next·PostCSS·테스트 도구 및 Tokio 권고를 반영한다. 감사 결과는 사용하는 플랫폼·실행 경로와 함께 재평가한다.
4. **재발 방지:** CI에 보안 검사와 XSS/파일 승인 회귀 테스트를 추가하고, branch protection·자동 보안 업데이트·서명 정책을 설정한다.
5. **실기기 확인:** 수정된 macOS WKWebView와 Windows WebView2에서 미리보기·PDF·DOCX·원본 저장을 검증한다. 이번 감사의 브라우저 재현을 네이티브 종단간 검증으로 대신하지 않는다.

## 재현 자료

원시 감사 JSON과 무해한 검증 산출물은 로컬 임시 경로 `/tmp/markmd-security-audit-2026-11-05/`에 보관했다. 외부 서비스에 업로드하거나 저장소에 커밋하지 않았다. 임시 경로는 OS 정리로 삭제될 수 있으므로 핵심 결과는 본문에 기록했다.

| 파일 | 내용 |
| --- | --- |
| `npm-audit.json`, `npm-audit-production.json` | 전체·개발 의존성 제외 npm 감사 스냅샷 |
| `cargo-audit.json` | RustSec DB 버전, 경고, 의존성 감사 결과 |
| `gitleaks-history.json` | 비밀정보 검사 결과, 빈 배열 |
| `pdf-xss-proof.json` | 미리보기 실행 0회, PDF 내보내기 후 실행 1회 |
| `write-command-proof.rs`, `write-command-proof.txt` | 원본 저장 함수 추출 하네스와 미승인 경로·심볼릭 링크 시험 결과 |
| `preview-policy-proof.json` | 문서 스타일의 body 적용 및 미리보기 URI 제거 결과 |
| `docx-link-proof.json` | DOCX에 남은 위험 URI |
| `remote-image-proof.json` | 승인 없이 발생한 다른 origin의 이미지 요청 |

보안 판정은 위 커밋과 점검 시점에 한정된다. 의존성 DB 갱신이나 후속 코드 변경 후에는 다시 검사해야 한다.
