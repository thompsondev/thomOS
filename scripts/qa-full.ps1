$ErrorActionPreference = 'Continue'
$base = "http://localhost:3020/v1"
$results = [System.Collections.Generic.List[object]]::new()

function Add-QaResult([string]$Area, [bool]$Ok, [string]$Detail = '') {
  $results.Add([pscustomobject]@{
      Area   = $Area
      Status = $(if ($Ok) { 'PASS' } else { 'FAIL' })
      Detail = $Detail
    })
}

# Public
try {
  $h = Invoke-RestMethod "$base/health"
  Add-QaResult 'Health' ($h.status -eq 'ok' -or $h.status -eq 'degraded') ($h | ConvertTo-Json -Compress)
} catch { Add-QaResult 'Health' $false $_.Exception.Message }

try {
  $b = Invoke-RestMethod "$base"
  Add-QaResult 'Root' ($b -match 'thomOS|Hello') "$b"
} catch { Add-QaResult 'Root' $false $_.Exception.Message }

try {
  $null = Invoke-WebRequest 'http://localhost:3020/dashboard.html' -UseBasicParsing
  Add-QaResult 'Dashboard static' $true
} catch { Add-QaResult 'Dashboard static' $false $_.Exception.Message }

try {
  Invoke-RestMethod "$base/profile/me" | Out-Null
  Add-QaResult 'Auth gate' $false 'should 401'
} catch { Add-QaResult 'Auth gate' $true 'blocked unauthenticated' }

# Login
$headers = $null
try {
  $login = Invoke-RestMethod -Method POST "$base/auth/login" -ContentType 'application/json' -Body (@{
      email    = 'Topeyemi33@gmail.com'
      password = 'ChangeMe123!'
    } | ConvertTo-Json)
  Add-QaResult 'Login' ([bool]$login.accessToken) $login.user.email
  $headers = @{ Authorization = "Bearer $($login.accessToken)" }
} catch {
  Add-QaResult 'Login' $false $_.Exception.Message
}

if ($headers) {
  try {
    $me = Invoke-RestMethod "$base/auth/me" -Headers $headers
    Add-QaResult 'Auth me' ($me.email -eq 'topeyemi33@gmail.com') $me.email
  } catch { Add-QaResult 'Auth me' $false $_.Exception.Message }

  try {
    $p = Invoke-RestMethod "$base/profile/me" -Headers $headers
    Add-QaResult 'Profile' ($p.skills.Count -ge 40 -and $p.experience.Count -ge 6) "skills=$($p.skills.Count) exp=$($p.experience.Count)"
  } catch { Add-QaResult 'Profile' $false $_.Exception.Message }

  try {
    $a = Invoke-RestMethod "$base/agents" -Headers $headers
    Add-QaResult 'Agents list' ($a.Count -eq 9) "count=$($a.Count)"
  } catch { Add-QaResult 'Agents list' $false $_.Exception.Message }

  try {
    $s = Invoke-RestMethod "$base/scheduler/status" -Headers $headers
    Add-QaResult 'Scheduler' $true ($s | ConvertTo-Json -Compress)
  } catch { Add-QaResult 'Scheduler' $false $_.Exception.Message }

  try {
    $es = Invoke-RestMethod "$base/emails/status" -Headers $headers
    Add-QaResult 'Email/Gmail status' $true "gmail=$($es.configured) calendar=$($es.calendar.googleCalendar)"
  } catch { Add-QaResult 'Email/Gmail status' $false $_.Exception.Message }

  $jobId = $null
  try {
    $job = Invoke-RestMethod -Method POST "$base/jobs" -Headers $headers -ContentType 'application/json' -Body (@{
        title       = 'Senior Frontend Engineer'
        company     = 'QA Full Suite Co'
        description = 'React TypeScript Next.js NestJS remote senior frontend role.'
        remote      = $true
        source      = 'manual_qa'
        sourceUrl   = 'https://example.com/apply/qa-full'
      } | ConvertTo-Json)
    $jobId = $job.id
    Add-QaResult 'Create job' ([bool]$jobId) $jobId
  } catch { Add-QaResult 'Create job' $false $_.Exception.Message }

  if ($jobId) {
    $resumeDocId = $null
    try {
      $docs = Invoke-RestMethod -Method POST "$base/agents/pipeline/documents" -Headers $headers -ContentType 'application/json' -Body (@{ jobId = $jobId } | ConvertTo-Json) -TimeoutSec 180
      $ok = -not ($docs.steps | Where-Object { -not $_.success })
      $resume = $docs.steps | Where-Object agentId -EQ resume | Select-Object -First 1
      $resumeDocId = $resume.data.documentId
      Add-QaResult 'Documents pipeline' $ok "resumePdf=$([bool]$resume.data.filePath)"
    } catch { Add-QaResult 'Documents pipeline' $false $_.Exception.Message }

    if ($resumeDocId) {
      try {
        $pdf = Invoke-WebRequest "$base/applications/documents/$resumeDocId/pdf" -Headers $headers
        Add-QaResult 'PDF download' ($pdf.StatusCode -eq 200 -and $pdf.RawContentLength -gt 500) "bytes=$($pdf.RawContentLength)"
      } catch { Add-QaResult 'PDF download' $false $_.Exception.Message }
    }

    $appId = $null
    try {
      $m = Invoke-RestMethod -Method POST "$base/agents/run" -Headers $headers -ContentType 'application/json' -Body (@{ agentId = 'matching'; jobId = $jobId } | ConvertTo-Json) -TimeoutSec 120
      $appId = $m.data.applicationId
      Add-QaResult 'Matching' $m.success "score=$($m.data.matchScore)"
    } catch { Add-QaResult 'Matching' $false $_.Exception.Message }

    if ($appId) {
      try {
        $ap = Invoke-RestMethod -Method POST "$base/agents/run" -Headers $headers -ContentType 'application/json' -Body (@{ agentId = 'application'; jobId = $jobId; applicationId = $appId } | ConvertTo-Json) -TimeoutSec 120
        Add-QaResult 'Application agent' $ap.success "answers=$($ap.data.answers.PSObject.Properties.Name.Count)"
      } catch { Add-QaResult 'Application agent' $false $_.Exception.Message }

      try {
        Invoke-RestMethod -Method PATCH "$base/applications/$appId/approve-submit" -Headers $headers | Out-Null
        Add-QaResult 'Approve submit' $true
      } catch { Add-QaResult 'Approve submit' $false $_.Exception.Message }

      try {
        $br = Invoke-RestMethod -Method POST "$base/agents/pipeline/browser" -Headers $headers -ContentType 'application/json' -Body (@{ jobId = $jobId; applicationId = $appId } | ConvertTo-Json) -TimeoutSec 120
        Add-QaResult 'Browser agent' $br.success "board=$($br.data.board) executed=$($br.data.executed)"
      } catch { Add-QaResult 'Browser agent' $false $_.Exception.Message }
    }

    $emailId = $null
    try {
      $em = Invoke-RestMethod -Method POST "$base/emails/ingest" -Headers $headers -ContentType 'application/json' -Body (@{
          fromAddress = 'recruiter@qafull.com'
          subject     = 'Interview for Senior Frontend'
          body        = 'Hi Thompson, interview Tuesday 3pm UTC for Senior Frontend at QA Full Suite Co.'
        } | ConvertTo-Json) -TimeoutSec 90
      $emailId = $em.id
      Add-QaResult 'Email ingest' ([bool]$em.category) "category=$($em.category)"
    } catch { Add-QaResult 'Email ingest' $false $_.Exception.Message }

    if ($emailId) {
      try {
        $cal = Invoke-RestMethod -Method POST "$base/emails/$emailId/calendar" -Headers $headers -ContentType 'application/json' -Body '{}' -TimeoutSec 60
        Add-QaResult 'Calendar schedule' ([bool]$cal.icsPath) "provider=$($cal.provider)"
      } catch { Add-QaResult 'Calendar schedule' $false $_.Exception.Message }
    }

    try {
      $chat = Invoke-RestMethod -Method POST "$base/chat/prompt" -Headers $headers -ContentType 'application/json' -Body (@{ prompt = 'Reply with exactly QA_OK' } | ConvertTo-Json) -TimeoutSec 60
      Add-QaResult 'Chat Claude' ("$chat" -match 'QA_OK')
    } catch { Add-QaResult 'Chat Claude' $false $_.Exception.Message }

    try {
      $ins = Invoke-RestMethod -Method POST "$base/agents/pipeline/insights" -Headers $headers -ContentType 'application/json' -Body '{}' -TimeoutSec 120
      Add-QaResult 'Insights' (-not ($ins.steps | Where-Object { -not $_.success }))
    } catch { Add-QaResult 'Insights' $false $_.Exception.Message }

    try {
      $d = Invoke-RestMethod -Method POST "$base/agents/pipeline/discover" -Headers $headers -ContentType 'application/json' -Body (@{ query = 'Senior Frontend React'; limit = 2 } | ConvertTo-Json) -TimeoutSec 180
      $disc = $d.steps | Where-Object agentId -EQ discovery | Select-Object -First 1
      Add-QaResult 'Live discovery' $disc.success "fetched=$($disc.data.fetched) saved=$(@($disc.data.jobIds).Count)"
    } catch { Add-QaResult 'Live discovery' $false $_.Exception.Message }

    try {
      $jobs = Invoke-RestMethod "$base/jobs" -Headers $headers
      $apps = Invoke-RestMethod "$base/applications" -Headers $headers
      $dash = Invoke-RestMethod "$base/applications/dashboard" -Headers $headers
      Add-QaResult 'Dashboard data' ($jobs.Count -ge 1) "jobs=$($jobs.Count) apps=$($apps.Count) total=$($dash.total)"
    } catch { Add-QaResult 'Dashboard data' $false $_.Exception.Message }

    try {
      $es = Invoke-RestMethod "$base/emails/status" -Headers $headers
      if ($es.configured) {
        Add-QaResult 'Gmail send ready' $true 'configured (send not executed in QA)'
      } else {
        Add-QaResult 'Gmail send ready' $false 'GMAIL_APP_PASSWORD not set'
      }
    } catch { Add-QaResult 'Gmail send ready' $false $_.Exception.Message }

    try {
      Set-Content -Path body.json -Value '{"prompt":"Say only: OK"}' -Encoding ascii
      $stream = & curl.exe -s -N -m 45 -X POST "$base/chat/prompt/stream" -H "Content-Type: application/json" -H "Authorization: Bearer $($headers.Authorization.Substring(7))" --data-binary '@body.json'
      Add-QaResult 'Chat SSE stream' ($stream -match 'done' -and $stream -match 'text')
    } catch { Add-QaResult 'Chat SSE stream' $false $_.Exception.Message }
  }
}

$pass = @($results | Where-Object Status -EQ PASS).Count
$fail = @($results | Where-Object Status -EQ FAIL).Count
Write-Host ""
Write-Host "=== FULL QA: $pass PASS / $fail FAIL / $($results.Count) TOTAL ==="
Write-Host ""
$results | Format-Table -AutoSize -Wrap
$results | ConvertTo-Json | Set-Content qa-full-report.json -Encoding utf8
Write-Host "REPORT=qa-full-report.json"
