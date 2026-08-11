-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "FusionStatus" AS ENUM ('DRAFT', 'APPROVED', 'SCHEDULED', 'LIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('IN_PROGRESS', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "GuessHint" AS ENUM ('CORRECT', 'SAME_LINE', 'WRONG');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("provider","providerAccountId")
);

-- CreateTable
CREATE TABLE "Session" (
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerificationToken_pkey" PRIMARY KEY ("identifier","token")
);

-- CreateTable
CREATE TABLE "Pokemon" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "evolutionChainId" INTEGER NOT NULL,
    "types" TEXT[],
    "spriteUrl" TEXT NOT NULL,
    "generation" INTEGER NOT NULL,

    CONSTRAINT "Pokemon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fusion" (
    "id" TEXT NOT NULL,
    "pokemonAId" INTEGER NOT NULL,
    "pokemonBId" INTEGER NOT NULL,
    "name" TEXT,
    "basePromptSnapshot" TEXT NOT NULL,
    "extraPrompt" TEXT,
    "imageUrl" TEXT NOT NULL,
    "imageGcsPath" TEXT NOT NULL,
    "rawImageUrl" TEXT,
    "rawImageGcsPath" TEXT,
    "focalX" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "focalY" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "FusionStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledForDate" TEXT,
    "liveDate" TEXT,
    "createdByAdminId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Fusion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FusionGeneration" (
    "id" TEXT NOT NULL,
    "fusionId" TEXT NOT NULL,
    "promptFull" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FusionGeneration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fusionId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "isAdminPreview" BOOLEAN NOT NULL DEFAULT false,
    "status" "AttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "guessesUsed" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Guess" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "guessIndex" INTEGER NOT NULL,
    "pokemonAId" INTEGER NOT NULL,
    "pokemonBId" INTEGER NOT NULL,
    "hintA" "GuessHint" NOT NULL,
    "hintB" "GuessHint" NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Guess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolloverLog" (
    "id" TEXT NOT NULL,
    "ranAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "laDate" TEXT NOT NULL,
    "fromFusionId" TEXT,
    "toFusionId" TEXT,
    "note" TEXT,

    CONSTRAINT "RolloverLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE INDEX "Pokemon_evolutionChainId_idx" ON "Pokemon"("evolutionChainId");

-- CreateIndex
CREATE INDEX "Fusion_status_idx" ON "Fusion"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Fusion_pokemonAId_pokemonBId_key" ON "Fusion"("pokemonAId", "pokemonBId");

-- CreateIndex
CREATE UNIQUE INDEX "Fusion_scheduledForDate_key" ON "Fusion"("scheduledForDate");

-- CreateIndex
CREATE UNIQUE INDEX "Fusion_liveDate_key" ON "Fusion"("liveDate");

-- CreateIndex
CREATE INDEX "FusionGeneration_fusionId_idx" ON "FusionGeneration"("fusionId");

-- CreateIndex
CREATE INDEX "Attempt_userId_date_idx" ON "Attempt"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Attempt_userId_fusionId_key" ON "Attempt"("userId", "fusionId");

-- CreateIndex
CREATE UNIQUE INDEX "Guess_attemptId_guessIndex_key" ON "Guess"("attemptId", "guessIndex");

-- CreateIndex
CREATE INDEX "RolloverLog_laDate_idx" ON "RolloverLog"("laDate");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fusion" ADD CONSTRAINT "Fusion_pokemonAId_fkey" FOREIGN KEY ("pokemonAId") REFERENCES "Pokemon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fusion" ADD CONSTRAINT "Fusion_pokemonBId_fkey" FOREIGN KEY ("pokemonBId") REFERENCES "Pokemon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FusionGeneration" ADD CONSTRAINT "FusionGeneration_fusionId_fkey" FOREIGN KEY ("fusionId") REFERENCES "Fusion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_fusionId_fkey" FOREIGN KEY ("fusionId") REFERENCES "Fusion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Guess" ADD CONSTRAINT "Guess_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "Attempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
