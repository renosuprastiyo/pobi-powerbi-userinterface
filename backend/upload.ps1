[string]$userName = 'POBIUAT227\reno'
[string]$userPassword = 'RenoSuprastiyo@789!'
[securestring]$secStringPassword = ConvertTo-SecureString $userPassword -AsPlainText -Force
$Credential = New-Object System.Management.Automation.PSCredential ($userName, $secStringPassword)

$ReportPortal = "http://192.168.99.190:8789/Reports"
$ReportName = 
$ReportTargetPath = "/"
$LoginDir = $($env:USERNAME)
$FileDir = "C:\Users\"

$SuffixDir = "\Documents\"
$FileToUpload = ($FileDir,$LoginDir,$SuffixDir,$ReportName) -join ""

$ReportTargetPathEncoded = ("%27", $ReportTargetPath, $ReportName, "%27") -join ""
$bytes = [System.IO.File]::ReadAllBytes($FileToUpload)
$pbixPayload = [System.Text.Encoding]::GetEncoding('ISO-8859-1').GetString($bytes);
$endpoint = $ReportPortal + "/api/v2.0/PowerBIReports(Path=$ReportTargetPathEncoded)/Model.Upload"
$boundary = [System.Guid]::NewGuid().ToString()
$LF = "`r`n"
$bodyLines = (
# Name
"--$boundary",
"Content-Disposition: form-data; name=`"Name`"$LF",
$ReportName,

# ContentType
"--$boundary",
"Content-Disposition: form-data; name=`"ContentType`"$LF",
"",

# Content
"--$boundary",
"Content-Disposition: form-data; name=`"Content`"$LF",
"undefined",

# Path
"--$boundary",
"Content-Disposition: form-data; name=`"Path`"$LF",
$ReportTargetPath,

# @odata.type
"--$boundary",
"Content-Disposition: form-data; name=`"@odata.type`"$LF",
"#Model.PowerBIReport",

# File
"--$boundary",
"Content-Disposition: form-data; name=`"File`"; filename=`"$ReportName`"",
"Content-Type: application/octet-stream$LF",
$pbixPayload,
"--$boundary--"
) -join $LF

Invoke-RestMethod `
-Uri $endPoint `
-Body $bodyLines `
-Method POST `
-Credential $Credential `
-ContentType "multipart/form-data; boundary=$boundary" `
-Headers @{
  "accept"="application/json, text/plain, */*"
  "accept-language"="en-US,en;q=0.9"
}
#Referenced from https://businesswintelligence.com/content/51/power-bi-report-server-api-upload