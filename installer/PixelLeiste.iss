; PixelLeiste – grafisches Setup und Deinstallation (Inno Setup 6)
; Bauen: installer\build.ps1   (baut erst release\win-unpacked mit electron-builder, dann dieses Setup)
;   oder direkt: ISCC.exe /DAppVersion=x.y.z installer\PixelLeiste.iss
;
; Ohne Administratorrechte. Einstellungen liegen unter %APPDATA%\PixelLeiste.
; Stilles Setup:  PixelLeiste-Setup-x.y.z.exe /VERYSILENT [/DIR="D:\PixelLeiste"] [/TASKS="desktopicon"]
;   [/RESTARTAPP=1 (PixelLeiste nach dem Update wieder starten - so ruft es die Update-Funktion auf)]

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif
#ifndef AppDir
  #define AppDir "..\release\win-unpacked"
#endif
#ifndef DistDir
  #define DistDir "..\release"
#endif

[Setup]
AppId={{B74EC122-6DAE-4D03-A0E7-A123F205E4DD}
AppName=PixelLeiste
AppVersion={#AppVersion}
AppVerName=PixelLeiste {#AppVersion}
AppPublisher=Phill (phillhf)
AppPublisherURL=https://github.com/phillhf/PixelLeiste
AppSupportURL=https://github.com/phillhf/PixelLeiste/issues
AppUpdatesURL=https://github.com/phillhf/PixelLeiste/releases
VersionInfoVersion={#AppVersion}
VersionInfoDescription=PixelLeiste Setup
DefaultDirName=C:\Tools\PixelLeiste
AppendDefaultDirName=no
DirExistsWarning=no
UsePreviousAppDir=yes
UsePreviousTasks=yes
DisableProgramGroupPage=yes
DisableWelcomePage=no
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir={#DistDir}
OutputBaseFilename=PixelLeiste-Setup-{#AppVersion}
SetupIconFile=app.ico
WizardStyle=modern
LicenseFile=..\LICENSE
UninstallDisplayName=PixelLeiste
UninstallDisplayIcon={app}\PixelLeiste.exe
Compression=lzma2/max
SolidCompression=yes
CloseApplications=yes
RestartApplications=no
ShowLanguageDialog=auto

[Languages]
Name: "de"; MessagesFile: "compiler:Languages\German.isl"
Name: "en"; MessagesFile: "compiler:Default.isl"

[Messages]
de.WelcomeLabel1=Willkommen bei PixelLeiste
en.WelcomeLabel1=Welcome to PixelLeiste

[CustomMessages]
de.Welcome=Dieses Setup installiert PixelLeiste {#AppVersion}.%n%nPixelLeiste steuert LED-Leisten und -Matrizen der „iPixel Color“-Familie (z. B. 96×16, Gerätename LED_BLE_…) per Bluetooth: Lauftext, Bilder, GIFs, Uhr und Live-Anzeigen.%n%nEs werden keine Administratorrechte benötigt.
en.Welcome=This setup installs PixelLeiste {#AppVersion}.%n%nPixelLeiste controls LED strips and matrices of the “iPixel Color” family (e.g. 96×16, device name LED_BLE_…) via Bluetooth: scrolling text, images, GIFs, clock and live displays.%n%nNo administrator rights are required.
de.WelcomeUpdate=PixelLeiste %1 ist bereits installiert in%n%2%n%nDas Setup aktualisiert auf Version {#AppVersion}. Einstellungen bleiben erhalten.
en.WelcomeUpdate=PixelLeiste %1 is already installed in%n%2%n%nThis setup updates it to version {#AppVersion}. Settings are kept.
de.NewerInstalled=Installiert ist bereits die neuere Version %1.%n%nTrotzdem die ältere Version {#AppVersion} einspielen?
en.NewerInstalled=The newer version %1 is already installed.%n%nInstall the older version {#AppVersion} anyway?
de.BadDir=Bitte einen Unterordner auf einer lokalen Festplatte wählen, z. B. C:\Tools\PixelLeiste.
en.BadDir=Please choose a subfolder on a local drive, e.g. C:\Tools\PixelLeiste.
de.DesktopIcon=Verknüpfung auf dem Desktop anlegen
en.DesktopIcon=Create a desktop shortcut
de.Shortcuts=Zusätzliche Verknüpfungen:
en.Shortcuts=Additional shortcuts:
de.Uninstall=PixelLeiste deinstallieren
en.Uninstall=Uninstall PixelLeiste
de.LaunchNow=PixelLeiste jetzt starten
en.LaunchNow=Start PixelLeiste now
de.Finished=PixelLeiste {#AppVersion} ist installiert.%n%nSo geht's los:%n  • LED-Leiste per USB mit Strom versorgen%n  • die Handy-App „iPixel Color“ schließen (nur eine Verbindung gleichzeitig)%n  • in PixelLeiste auf „Verbinden“ klicken und LED_BLE_… wählen%n%nDer PC braucht Bluetooth (eingebaut oder USB-Stick).
en.Finished=PixelLeiste {#AppVersion} is installed.%n%nGetting started:%n  • power the LED strip via USB%n  • close the “iPixel Color” phone app (only one connection at a time)%n  • click “Verbinden” (Connect) in PixelLeiste and choose LED_BLE_…%n%nThe PC needs Bluetooth (built-in or a USB dongle).
de.Operation=Vorgang:
en.Operation=Operation:
de.OpUpdate=Update von %1 auf {#AppVersion} (Einstellungen bleiben erhalten)
en.OpUpdate=Update from %1 to {#AppVersion} (settings are kept)
de.OpInstall=Neuinstallation von PixelLeiste {#AppVersion}
en.OpInstall=New installation of PixelLeiste {#AppVersion}
de.DeleteData=Sollen auch die Einstellungen (zuletzt verwendete Texte, Farben usw.) gelöscht werden?%n%nOrdner: %1%n%nBei „Nein“ bleiben sie erhalten und werden bei einer Neuinstallation wieder verwendet.
en.DeleteData=Should the settings (recent texts, colours etc.) be deleted as well?%n%nFolder: %1%n%nIf you choose “No” they are kept and reused by a later reinstallation.

[Tasks]
Name: "desktopicon"; Description: "{cm:DesktopIcon}"; GroupDescription: "{cm:Shortcuts}"

[InstallDelete]
; Ein Update ersetzt die komplette Electron-Laufzeit – alte Dateien nicht liegen lassen
Type: filesandordirs; Name: "{app}\resources"
Type: filesandordirs; Name: "{app}\locales"

[Files]
Source: "{#AppDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\README.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\README_de.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\LICENSE"; DestDir: "{app}"; DestName: "LICENSE.txt"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\PixelLeiste\PixelLeiste"; Filename: "{app}\PixelLeiste.exe"; WorkingDir: "{app}"
Name: "{autoprograms}\PixelLeiste\{cm:Uninstall}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\PixelLeiste"; Filename: "{app}\PixelLeiste.exe"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "{app}\PixelLeiste.exe"; WorkingDir: "{app}"; Description: "{cm:LaunchNow}"; Flags: postinstall nowait skipifsilent
; Nach einem Update ueber die eingebaute Update-Funktion PixelLeiste wieder starten
Filename: "{app}\PixelLeiste.exe"; WorkingDir: "{app}"; Flags: nowait; Check: RestartAfterSilentUpdate

[UninstallDelete]
Type: dirifempty; Name: "{app}"

[Code]
var
  OldVersion, OldDir: String;

// Versionen wie 1.10.2 vergleichen: <0 aelter, 0 gleich, >0 neuer
function CompareVersion(A, B: String): Integer;
var
  PA, PB, NA, NB: Integer;
begin
  Result := 0;
  while (Result = 0) and ((A <> '') or (B <> '')) do
  begin
    PA := Pos('.', A); PB := Pos('.', B);
    if PA = 0 then begin NA := StrToIntDef(A, 0); A := ''; end else begin NA := StrToIntDef(Copy(A, 1, PA - 1), 0); A := Copy(A, PA + 1, Length(A)); end;
    if PB = 0 then begin NB := StrToIntDef(B, 0); B := ''; end else begin NB := StrToIntDef(Copy(B, 1, PB - 1), 0); B := Copy(B, PB + 1, Length(B)); end;
    Result := NA - NB;
  end;
end;

function UninstallKey(): String;
begin
  Result := 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{B74EC122-6DAE-4D03-A0E7-A123F205E4DD}_is1';
end;

function IsUpdate(): Boolean;
begin
  Result := OldVersion <> '';
end;

// Vor dem Assistenten: vorhandene Installation erkennen
function InitializeSetup(): Boolean;
begin
  Result := True;
  if not RegQueryStringValue(HKCU, UninstallKey(), 'DisplayVersion', OldVersion) then
    RegQueryStringValue(HKLM, UninstallKey(), 'DisplayVersion', OldVersion);
  if not RegQueryStringValue(HKCU, UninstallKey(), 'InstallLocation', OldDir) then
    RegQueryStringValue(HKLM, UninstallKey(), 'InstallLocation', OldDir);
  if IsUpdate() and (CompareVersion(OldVersion, '{#AppVersion}') > 0) and not WizardSilent() then
    Result := MsgBox(FmtMessage(CustomMessage('NewerInstalled'), [OldVersion]), mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES;
end;

procedure InitializeWizard;
begin
  if IsUpdate() then
    WizardForm.WelcomeLabel2.Caption := FmtMessage(CustomMessage('WelcomeUpdate'), [OldVersion, RemoveBackslashUnlessRoot(OldDir)])
  else
    WizardForm.WelcomeLabel2.Caption := CustomMessage('Welcome');
end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  // Bei einem Update bleibt der Ordner - nur bei einer Neuinstallation fragen
  Result := (PageID = wpSelectDir) and IsUpdate();
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  D: String;
begin
  Result := True;
  if CurPageID = wpSelectDir then
  begin
    D := WizardForm.DirEdit.Text;
    if (Copy(D, 1, 2) = '\\') or (Length(D) <= 3) then
    begin
      MsgBox(CustomMessage('BadDir'), mbError, MB_OK);
      Result := False;
    end;
  end;
end;

function UpdateReadyMemo(Space, NewLine, MemoUserInfoInfo, MemoDirInfo, MemoTypeInfo,
  MemoComponentsInfo, MemoGroupInfo, MemoTasksInfo: String): String;
begin
  Result := CustomMessage('Operation') + NewLine + Space;
  if IsUpdate() then
    Result := Result + FmtMessage(CustomMessage('OpUpdate'), [OldVersion])
  else
    Result := Result + CustomMessage('OpInstall');
  Result := Result + NewLine + NewLine + MemoDirInfo;
  if MemoTasksInfo <> '' then Result := Result + NewLine + NewLine + MemoTasksInfo;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  Code: Integer;
begin
  // Stilles Update aus dem Programm heraus: laufendes PixelLeiste beenden, damit die Dateien ersetzt werden koennen.
  // (Interaktiv fragt Inno Setup selbst nach, ob laufende Programme geschlossen werden sollen.)
  if WizardSilent() then
  begin
    Sleep(1500);
    Exec(ExpandConstant('{sys}\taskkill.exe'), '/F /IM PixelLeiste.exe', '', SW_HIDE, ewWaitUntilTerminated, Code);
    Sleep(500);
  end;
  Result := '';
end;

function RestartAfterSilentUpdate(): Boolean;
begin
  Result := WizardSilent() and (ExpandConstant('{param:RESTARTAPP|0}') = '1');
end;

procedure CurPageChanged(CurPageID: Integer);
begin
  if CurPageID = wpFinished then
  begin
    WizardForm.FinishedLabel.Caption := CustomMessage('Finished');
    WizardForm.AdjustLabelHeight(WizardForm.FinishedLabel);
    WizardForm.RunList.Top := WizardForm.FinishedLabel.Top + WizardForm.FinishedLabel.Height + ScaleY(12);
  end;
end;

// ---- Deinstallation: Einstellungen auf Wunsch behalten
var
  DeleteData: Boolean;

function InitializeUninstall(): Boolean;
begin
  Result := True;
  DeleteData := False;
  if not UninstallSilent() then
    DeleteData := MsgBox(FmtMessage(CustomMessage('DeleteData'), [ExpandConstant('{userappdata}\PixelLeiste')]),
      mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep <> usPostUninstall then Exit;
  if DeleteData then
    DelTree(ExpandConstant('{userappdata}\PixelLeiste'), True, True, True);
end;
