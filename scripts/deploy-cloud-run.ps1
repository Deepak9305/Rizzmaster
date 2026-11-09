param(
  [string]$ProjectId = "rizz-master-afecf",
  [string]$Region = "us-central1",
  [string]$ServiceName = "rizzmaster-api",
  [string]$ImageName = "gcr.io/$ProjectId/$ServiceName",
  [string]$SqlInstance = "rizzmaster-db",
  [string]$DatabaseName = "rizzmaster",
  [string]$DbUser = "rizzmaster_app",
  [string]$DbPasswordSecret = "rizzmaster-db-password",
  [string]$RuntimeServiceAccount = "rizzmaster-cloud-run@$ProjectId.iam.gserviceaccount.com"
)

$ErrorActionPreference = "Stop"

gcloud config set project $ProjectId | Out-Null

$connectionName = gcloud sql instances describe $SqlInstance --project $ProjectId --format="value(connectionName)"
if (-not $connectionName) {
  throw "Cloud SQL instance '$SqlInstance' was not found in project '$ProjectId'."
}

$secrets = @(
  "PGPASSWORD=${DbPasswordSecret}:latest"
)

$optionalSecrets = @(
  @{ Secret = "groq-api-key"; Env = "GROQ_API_KEY" },
  @{ Secret = "gemini-api-key"; Env = "GEMINI_API_KEY" },
  @{ Secret = "openai-api-key"; Env = "OPENAI_API_KEY" },
  @{ Secret = "google-play-service-account-json"; Env = "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON" },
  @{ Secret = "apple-app-store-issuer-id"; Env = "APPLE_APP_STORE_ISSUER_ID" },
  @{ Secret = "apple-app-store-key-id"; Env = "APPLE_APP_STORE_KEY_ID" },
  @{ Secret = "apple-app-store-private-key"; Env = "APPLE_APP_STORE_PRIVATE_KEY" }
)

foreach ($item in $optionalSecrets) {
  cmd /c "gcloud secrets describe $($item.Secret) --project $ProjectId >nul 2>nul"
  if ($LASTEXITCODE -eq 0) {
    $secrets += "$($item.Env)=$($item.Secret):latest"
  }
}

$envVars = @(
  "NODE_ENV=production",
  "GOOGLE_CLOUD_PROJECT=$ProjectId",
  "GCLOUD_PROJECT=$ProjectId",
  "FIREBASE_PROJECT_ID=$ProjectId",
  "CLOUD_SQL_CONNECTION_NAME=$connectionName",
  "PGHOST=/cloudsql/$connectionName",
  "PGPORT=5432",
  "PGDATABASE=$DatabaseName",
  "PGUSER=$DbUser",
  "GOOGLE_PLAY_PACKAGE_NAME=app.vercel.rizzmaster"
)

Write-Host "Building backend container..."
gcloud builds submit --tag $ImageName --ignore-file=.gcloudignore

Write-Host "Deploying Cloud Run service..."
gcloud run deploy $ServiceName `
  --image $ImageName `
  --region $Region `
  --platform managed `
  --allow-unauthenticated `
  --port 8080 `
  --service-account $RuntimeServiceAccount `
  --add-cloudsql-instances $connectionName `
  --set-env-vars="$($envVars -join ",")" `
  --set-secrets="$($secrets -join ",")"

Write-Host "Deployment command completed."
