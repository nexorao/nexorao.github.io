Option Explicit

Dim fso, shell, root, nodeExe, serverFile, command, result, request, attempt, ready
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

root = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = root
nodeExe = shell.ExpandEnvironmentStrings("%ProgramFiles%\nodejs\node.exe")
If Not fso.FileExists(nodeExe) Then nodeExe = "node.exe"
serverFile = root & "\.next-validation\standalone\server.js"

If Not fso.FileExists(serverFile) Then

  shell.Environment("PROCESS")("NEXORAO_BUILD_DIR") = ".next-validation"
  command = Chr(34) & nodeExe & Chr(34) & " scripts\build-production.mjs"
  result = shell.Run(command, 0, True)
  shell.Environment("PROCESS")("NEXORAO_BUILD_DIR") = ""
  If result <> 0 Then
    MsgBox "Nexorao build failed. Please review the build output by running npm run build.", 16, "Nexorao"
    WScript.Quit result
  End If
End If

command = Chr(34) & nodeExe & Chr(34) & " --env-file-if-exists=.env.local scripts\start-local-db.mjs"
result = shell.Run(command, 0, True)
If result <> 0 Then
  MsgBox "The local database did not start. Check DATABASE_URL and the database files.", 16, "Nexorao"
  WScript.Quit result
End If

command = Chr(34) & nodeExe & Chr(34) & " --env-file-if-exists=.env.local node_modules\tsx\dist\cli.mjs src\db\run-migrations.ts"
result = shell.Run(command, 0, True)
If result <> 0 Then
  MsgBox "Nexorao could not update the local database schema. Check DATABASE_URL and run npm run db:migrate to review the error.", 16, "Nexorao"
  WScript.Quit result
End If

command = Chr(34) & nodeExe & Chr(34) & " --env-file-if-exists=.env.local .next-validation\standalone\server.js"
shell.Environment("PROCESS")("PORT") = "3102"
shell.Environment("PROCESS")("HOSTNAME") = "127.0.0.1"
shell.Run command, 0, False

ready = False
For attempt = 1 To 40
  On Error Resume Next
  Set request = CreateObject("MSXML2.XMLHTTP")
  request.open "GET", "http://127.0.0.1:3102/", False
  request.send
  If Err.Number = 0 Then
    If request.status < 500 Then ready = True
  End If
  Err.Clear
  On Error GoTo 0
  If ready Then Exit For
  WScript.Sleep 500
Next

If ready Then
  shell.Run "http://localhost:3102", 1, False
Else
  MsgBox "Nexorao server did not respond on port 3102. Check the database and server configuration.", 16, "Nexorao"
End If
