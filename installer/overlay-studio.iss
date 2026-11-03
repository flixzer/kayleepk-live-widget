; Inno Setup script for Overlay Studio.
; Build:  iscc /DAppVersion=0.1.0 installer\overlay-studio.iss
; Expects the release exe at overlay-studio\target\release\overlay-studio.exe
; and writes dist\OverlayStudio-Setup.exe (the asset name the in-app updater looks for).

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif
#ifndef ExePath
  #define ExePath "..\overlay-studio\target\release\overlay-studio.exe"
#endif

[Setup]
AppId={{381572D6-35F7-4C4D-86D5-5A6A5E11F4D3}
AppName=Overlay Studio
AppVersion={#AppVersion}
AppVerName=Overlay Studio {#AppVersion}
AppPublisher=flixzer
AppPublisherURL=https://github.com/flixzer/kayleepk-live-widget
; Per-user install: no admin prompt, so silent auto-updates can run unattended.
PrivilegesRequired=lowest
DefaultDirName={localappdata}\Programs\OverlayStudio
DisableDirPage=auto
DisableProgramGroupPage=yes
OutputDir=..\dist
OutputBaseFilename=OverlayStudio-Setup
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={app}\overlay-studio.exe
; Close a running copy before replacing files (the updater also exits itself first).
CloseApplications=force
RestartApplications=no
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "{#ExePath}"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\Overlay Studio"; Filename: "{app}\overlay-studio.exe"
Name: "{autodesktop}\Overlay Studio"; Filename: "{app}\overlay-studio.exe"; Tasks: desktopicon

[Run]
; Interactive install: offer to launch. Silent install (auto-update): always relaunch.
Filename: "{app}\overlay-studio.exe"; Description: "{cm:LaunchProgram,Overlay Studio}"; Flags: nowait postinstall skipifsilent
Filename: "{app}\overlay-studio.exe"; Flags: nowait; Check: WizardSilent

[UninstallDelete]
; WebView2 cache created next to the exe. Settings in %APPDATA%\OverlayStudio are kept.
Type: filesandordirs; Name: "{app}\overlay-studio.exe.WebView2"
