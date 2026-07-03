param(
  [string]$ProjectId = "rizz-master-afecf",
  [string]$Region = "us-central1",
  [string]$SqlInstance = "rizzmaster-db",
  [string]$DatabaseName = "rizzmaster",
  [string]$DbUser = "rizzmaster_app"
)

$ErrorActionPreference = "Stop"

gcloud config set project $ProjectId | Out-Null

$services = @(
  "run.googleapis.com",
  "sqladmin.googleapis.com",
  "secretmanager.googleapis.com",
  "artifactregistry.googleapis.com",
  "cloudbuild.googleapis.com",
  "firebase.googleapis.com",
  "identitytoolkit.googleapis.com",
  "firebaseremoteconfig.googleapis.com",
  "firebasehosting.googleapis.com",
  "logging.googleapis.com",
  "monitoring.googleapis.com"
)

Write-Host "Enabling required services..."
gcloud services enable $services

Write-Host "Ensuring Cloud SQL instance exists..."
$instanceCheck = gcloud sql instances list --filter="name=$SqlInstance" --format="value(name)"
if (-not $instanceCheck) {
  gcloud sql instances create $SqlInstance `
    --database-version=POSTGRES_15 `
    --cpu=1 `
    --memory=3840MiB `
    --region=$Region `
    --storage-size=20GB `
    --storage-type=SSD
}

Write-Host "Ensuring database exists..."
$dbCheck = gcloud sql databases list --instance=$SqlInstance --filter="name=$DatabaseName" --format="value(name)"
if (-not $dbCheck) {
  gcloud sql databases create $DatabaseName --instance=$SqlInstance
}

Write-Host "Ensuring application DB user exists..."
$userCheck = gcloud sql users list --instance=$SqlInstance --filter="name=$DbUser" --format="value(name)"
if (-not $userCheck) {
  Write-Warning "Cloud SQL user '$DbUser' does not exist yet. Create it manually with a password or use gcloud sql users create."
}

Write-Host "Bootstrap checks completed."
