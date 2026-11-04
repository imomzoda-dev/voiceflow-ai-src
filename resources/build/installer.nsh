; VoiceFlow AI — installer customisation (included by electron-builder).
;
; Detects an existing installation and turns the installer into an updater:
;   * first page says "Update 1.0.0 -> 1.1.0" and its button is "Update" instead of "Next/Install";
;   * the install-mode and folder pages are skipped (the existing folder and mode are kept);
;   * progress and finish pages say "Updating…" / "Updated";
;   * the same version shows "Reinstall", an older installer warns about a downgrade.
; User data (%APPDATA%\VoiceFlow AI: documents, dictation history, dictionary, speech models, encrypted API keys,
; settings) lives outside the program folder and is never touched; the previous version is removed with /KEEP_APP_DATA.

!include LogicLib.nsh
!include nsDialogs.nsh
!include WordFunc.nsh
; Defining customCheckAppRunning makes electron-builder skip these; the default check below needs them.
!include "getProcessInfo.nsh"
Var pid

; Everything below except the app-running check is for the installer only (not the uninstaller).
!ifndef BUILD_UNINSTALLER

Var VfOldVersion
; install | update | reinstall | downgrade
Var VfMode
Var VfOldDir
Var VfBody
Var VfFinishTitle
Var VfFinishText

; Pages between our first page and the progress page, counted at compile time so the "Update"
; button can jump straight to the progress page whatever pages this build has.
!define /redef VF_SKIP 1
!ifmacrodef licensePage
  !define /redef /math VF_SKIP ${VF_SKIP} + 1
!endif
!ifndef INSTALL_MODE_PER_ALL_USERS
  !define /redef /math VF_SKIP ${VF_SKIP} + 1
!endif
!ifdef allowToChangeInstallationDirectory
  !define /redef /math VF_SKIP ${VF_SKIP} + 1
!endif

!macro customHeader
  ; ---------- texts (Russian and English; other languages fall back to English) ----------
  LangString VfWelcomeTitle ${LANG_ENGLISH} "Install ${PRODUCT_NAME}"
  LangString VfWelcomeSub ${LANG_ENGLISH} "Version ${VERSION}"
  LangString VfWelcomeBody ${LANG_ENGLISH} "This wizard installs ${PRODUCT_NAME} ${VERSION} — voice typing in any app and an AI document workspace.$\r$\n$\r$\nClick Next to choose installation options."
  LangString VfUpdateTitle ${LANG_ENGLISH} "Update ${PRODUCT_NAME}"
  LangString VfUpdateSub ${LANG_ENGLISH} "Version $VfOldVersion  →  ${VERSION}"
  LangString VfUpdateBody ${LANG_ENGLISH} "${PRODUCT_NAME} $VfOldVersion is installed on this computer. It will be updated to version ${VERSION}.$\r$\n$\r$\nYour documents, dictation history, dictionary, speech models, API keys and settings are kept: they are stored separately from the program files.$\r$\n$\r$\nIf ${PRODUCT_NAME} is running, you will be asked to close it.$\r$\n$\r$\nFolder: $VfOldDir"
  LangString VfReinstallTitle ${LANG_ENGLISH} "Reinstall ${PRODUCT_NAME}"
  LangString VfReinstallSub ${LANG_ENGLISH} "Version ${VERSION} is already installed"
  LangString VfReinstallBody ${LANG_ENGLISH} "${PRODUCT_NAME} ${VERSION} is already installed. Reinstalling restores the program files; your documents, models and settings are kept.$\r$\n$\r$\nFolder: $VfOldDir"
  LangString VfDowngradeTitle ${LANG_ENGLISH} "A newer version is installed"
  LangString VfDowngradeSub ${LANG_ENGLISH} "Installed: $VfOldVersion  ·  this installer: ${VERSION}"
  LangString VfDowngradeBody ${LANG_ENGLISH} "This computer has a newer ${PRODUCT_NAME} ($VfOldVersion). Installing ${VERSION} replaces it with an older version. Your data is kept, but data created by the newer version may not open in the older one.$\r$\n$\r$\nContinue only if you really need the older version."
  LangString VfBtnUpdate ${LANG_ENGLISH} "&Update"
  LangString VfBtnReinstall ${LANG_ENGLISH} "&Reinstall"
  LangString VfBtnDowngrade ${LANG_ENGLISH} "&Install ${VERSION}"
  LangString VfUpdating ${LANG_ENGLISH} "Updating ${PRODUCT_NAME}"
  LangString VfUpdatingSub ${LANG_ENGLISH} "Replacing version $VfOldVersion with ${VERSION}. Your data stays in place."
  LangString VfUpdatedTitle ${LANG_ENGLISH} "${PRODUCT_NAME} has been updated"
  LangString VfUpdatedText ${LANG_ENGLISH} "Version ${VERSION} is installed. Your documents, models and settings were kept.$\r$\n$\r$\nClick Finish to close the wizard."

  !ifdef LANG_RUSSIAN
    LangString VfWelcomeTitle ${LANG_RUSSIAN} "Установка ${PRODUCT_NAME}"
    LangString VfWelcomeSub ${LANG_RUSSIAN} "Версия ${VERSION}"
    LangString VfWelcomeBody ${LANG_RUSSIAN} "Мастер установит ${PRODUCT_NAME} ${VERSION} — голосовой ввод в любом приложении и AI-редактор документов.$\r$\n$\r$\nНажмите «Далее», чтобы выбрать параметры установки."
    LangString VfUpdateTitle ${LANG_RUSSIAN} "Обновление ${PRODUCT_NAME}"
    LangString VfUpdateSub ${LANG_RUSSIAN} "Версия $VfOldVersion  →  ${VERSION}"
    LangString VfUpdateBody ${LANG_RUSSIAN} "На этом компьютере установлена ${PRODUCT_NAME} $VfOldVersion. Она будет обновлена до версии ${VERSION}.$\r$\n$\r$\nДокументы, история диктовок, словарь, модели распознавания, API-ключи и настройки сохранятся: они хранятся отдельно от файлов программы.$\r$\n$\r$\nЕсли ${PRODUCT_NAME} сейчас открыта, установщик попросит её закрыть.$\r$\n$\r$\nПапка: $VfOldDir"
    LangString VfReinstallTitle ${LANG_RUSSIAN} "Переустановка ${PRODUCT_NAME}"
    LangString VfReinstallSub ${LANG_RUSSIAN} "Версия ${VERSION} уже установлена"
    LangString VfReinstallBody ${LANG_RUSSIAN} "${PRODUCT_NAME} ${VERSION} уже установлена. Переустановка восстановит файлы программы; документы, модели и настройки сохранятся.$\r$\n$\r$\nПапка: $VfOldDir"
    LangString VfDowngradeTitle ${LANG_RUSSIAN} "Установлена более новая версия"
    LangString VfDowngradeSub ${LANG_RUSSIAN} "Установлена: $VfOldVersion  ·  этот установщик: ${VERSION}"
    LangString VfDowngradeBody ${LANG_RUSSIAN} "На компьютере уже есть более новая ${PRODUCT_NAME} ($VfOldVersion). Установка ${VERSION} заменит её более старой версией. Данные сохранятся, но то, что создано в новой версии, может не открыться в старой.$\r$\n$\r$\nПродолжайте, только если вам действительно нужна старая версия."
    LangString VfBtnUpdate ${LANG_RUSSIAN} "&Обновить"
    LangString VfBtnReinstall ${LANG_RUSSIAN} "&Переустановить"
    LangString VfBtnDowngrade ${LANG_RUSSIAN} "&Установить ${VERSION}"
    LangString VfUpdating ${LANG_RUSSIAN} "Обновление ${PRODUCT_NAME}"
    LangString VfUpdatingSub ${LANG_RUSSIAN} "Версия $VfOldVersion заменяется на ${VERSION}. Ваши данные остаются на месте."
    LangString VfUpdatedTitle ${LANG_RUSSIAN} "${PRODUCT_NAME} обновлена"
    LangString VfUpdatedText ${LANG_RUSSIAN} "Установлена версия ${VERSION}. Документы, модели и настройки сохранены.$\r$\n$\r$\nНажмите «Готово», чтобы закрыть мастер."
  !endif
!macroend

!macro customInit
  ; Previous installation of this app (per-user first, then for all users).
  StrCpy $VfMode "install"
  ReadRegStr $VfOldVersion HKCU "${UNINSTALL_REGISTRY_KEY}" "DisplayVersion"
  ReadRegStr $VfOldDir HKCU "${INSTALL_REGISTRY_KEY}" "InstallLocation"
  ${If} $VfOldVersion == ""
    ReadRegStr $VfOldVersion HKLM "${UNINSTALL_REGISTRY_KEY}" "DisplayVersion"
    ReadRegStr $VfOldDir HKLM "${INSTALL_REGISTRY_KEY}" "InstallLocation"
  ${EndIf}
  ${If} $VfOldDir == ""
    StrCpy $VfOldDir $INSTDIR
  ${EndIf}
  ${If} $VfOldVersion != ""
    ; 0 = same, 1 = installed is newer, 2 = installed is older
    ${VersionCompare} $VfOldVersion "${VERSION}" $R0
    ${If} $R0 == 0
      StrCpy $VfMode "reinstall"
    ${ElseIf} $R0 == 1
      StrCpy $VfMode "downgrade"
    ${Else}
      StrCpy $VfMode "update"
    ${EndIf}
  ${EndIf}
  ${If} $VfMode == "update"
    StrCpy $VfFinishTitle "$(VfUpdatedTitle)"
    StrCpy $VfFinishText "$(VfUpdatedText)"
  ${Else}
    StrCpy $VfFinishTitle "$(MUI_TEXT_FINISH_INFO_TITLE)"
    StrCpy $VfFinishText "$(MUI_TEXT_FINISH_INFO_TEXT)"
  ${EndIf}
!macroend

!macro customWelcomePage
  Page custom VfFirstPageCreate VfFirstPageLeave
  ; The standard finish page takes its title and text from these (filled at runtime).
  !define MUI_FINISHPAGE_TITLE "$VfFinishTitle"
  !define MUI_FINISHPAGE_TEXT "$VfFinishText"

  Function VfFirstPageCreate
    ; Started by the app's own updater (--updated): no questions, straight to the progress page.
    ${If} ${isUpdated}
      Abort
    ${EndIf}
    ${If} $VfMode == "update"
      !insertmacro MUI_HEADER_TEXT "$(VfUpdateTitle)" "$(VfUpdateSub)"
      StrCpy $VfBody "$(VfUpdateBody)"
    ${ElseIf} $VfMode == "reinstall"
      !insertmacro MUI_HEADER_TEXT "$(VfReinstallTitle)" "$(VfReinstallSub)"
      StrCpy $VfBody "$(VfReinstallBody)"
    ${ElseIf} $VfMode == "downgrade"
      !insertmacro MUI_HEADER_TEXT "$(VfDowngradeTitle)" "$(VfDowngradeSub)"
      StrCpy $VfBody "$(VfDowngradeBody)"
    ${Else}
      !insertmacro MUI_HEADER_TEXT "$(VfWelcomeTitle)" "$(VfWelcomeSub)"
      StrCpy $VfBody "$(VfWelcomeBody)"
    ${EndIf}

    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}
    ${NSD_CreateLabel} 0 0 100% 100% "$VfBody"
    Pop $0

    ; The main button names the action that will happen.
    GetDlgItem $1 $HWNDPARENT 1
    ${If} $VfMode == "update"
      SendMessage $1 ${WM_SETTEXT} 0 "STR:$(VfBtnUpdate)"
    ${ElseIf} $VfMode == "reinstall"
      SendMessage $1 ${WM_SETTEXT} 0 "STR:$(VfBtnReinstall)"
    ${ElseIf} $VfMode == "downgrade"
      SendMessage $1 ${WM_SETTEXT} 0 "STR:$(VfBtnDowngrade)"
    ${EndIf}
    nsDialogs::Show
  FunctionEnd

  Function VfFirstPageLeave
    ${If} $VfMode != "install"
      ; Existing installation: keep its folder and mode, go straight to the progress page.
      StrCpy $INSTDIR $VfOldDir
      SendMessage $HWNDPARENT 0x408 ${VF_SKIP} ""
      Abort
    ${EndIf}
  FunctionEnd
!macroend

; An existing installation keeps its mode (just me / all users) without asking again.
!macro customInstallMode
  ${If} $VfMode != "install"
    ${If} $hasPerMachineInstallation == "1"
      StrCpy $isForceMachineInstall "1"
    ${Else}
      StrCpy $isForceCurrentInstall "1"
    ${EndIf}
  ${EndIf}
!macroend

; Finish page with "Run VoiceFlow AI"; after an in-app update the new version starts by itself.
!macro customFinishPage
  Function VfFinishPre
    ${If} ${isUpdated}
      ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "--updated"
      Quit
    ${EndIf}
  FunctionEnd
  Function VfStartApp
    ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" ""
  FunctionEnd
  !define MUI_PAGE_CUSTOMFUNCTION_PRE VfFinishPre
  !define MUI_FINISHPAGE_RUN
  !define MUI_FINISHPAGE_RUN_FUNCTION VfStartApp
  !insertmacro MUI_PAGE_FINISH
!macroend

!endif ; BUILD_UNINSTALLER

; Runs at the start of installation (before the old version is removed): name the step properly,
; then perform the standard "is the app running?" check.
!macro customCheckAppRunning
  !ifndef BUILD_UNINSTALLER
    ${If} $VfMode == "update"
      !insertmacro MUI_HEADER_TEXT "$(VfUpdating)" "$(VfUpdatingSub)"
    ${EndIf}
  !endif
  !insertmacro IS_POWERSHELL_AVAILABLE
  !insertmacro _CHECK_APP_RUNNING
!macroend
