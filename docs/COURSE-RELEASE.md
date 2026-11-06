# Publish the local course project

The student delivery model is a local install, not a shared hosted service. Original code and docs are MIT licensed. Retain LICENSE and THIRD-PARTY-NOTICES.md in every student source copy. Separately authored recordings and media keep their own terms.

## Produce and verify the source download

1. Run `npm ci` with Node 24 LTS. Review the working changes and use `npm run verify`, then `npm run test:e2e` and `npm run regression`. Live tests are separate, optional and billed by providers.
2. Run `npm run release:course`. It writes `.data/course-release/mastra-learning-platform-<version>.zip` and a SHA256 sidecar. This is an instructor command requiring Git; students can run the extracted project without initializing a repository.
3. Inspect COURSE-MANIFEST.json and COURSE-MAP.json in the ZIP. The manifest identifies the base commit, whether the source is dirty, each file hash and an aggregate tree hash. A dirty artifact is reviewable but must not be advertised as an exact committed release. Review/commit/tag before final publication and rebuild from that source state.
4. Run `npm run release:course:drill`. This rebuilds the ZIP, extracts an owned copy under `.data/course-release-drills`, installs locked dependencies, builds, starts the built API/web and executes Lab 00 offline with no instructor provider credentials. It writes RESULT.json and install/build logs. The process runs locally, does not deploy or call a paid model, and retains its isolated files for review.
5. Rebuild after final documentation/spec changes. Confirm the sidecar SHA256 and keep the ZIP, release tag and evidence together. Repeated packaging from identical source bytes/provenance produces identical ZIP bytes. The archive excludes implementation reports to keep changing instructor evidence out of student source checksums.

The allowlist includes source, configurations, dependency lockfile, fixtures, docs, course prompts and relevant CI files. It rejects unsafe/symbolic paths, private credential assignments in config examples, oversized files or incomplete lab references. Installed dependencies, `.env` credentials, private data, build/test output, IDE/VCS data, implementation reports and regression evidence are excluded. Do not put instructor keys or personal records into source files; review the manifest before distribution.

## Instructor publication checklist

- [ ] Commit/tag the final reviewed release and confirm all required CI jobs, including container/regression and the OS tooling matrix. Local test evidence does not substitute for remotely executed CI.
- [ ] Upload the source ZIP as a Udemy downloadable resource and link each lecture to its matching lab using COURSE-MAP.json. Include STUDENT-GUIDE.md as the first setup resource.
- [ ] Record/review the lectures against the released UI, correct captions and check audio/video quality. The platform includes instructor outlines, not verified finished recordings.
- [ ] Apply Udemy's current course-quality and AI-generated-content disclosure rules. This project contains substantial assisted code and assessment content; review/edit the teaching material and include the applicable disclosure.
- [ ] Pilot installation with new students on each advertised OS. CI matrix configuration is not proof of a completed learner pilot or physical installation drill on every platform.
- [ ] Explain offline defaults, optional provider billing, update/back-up steps and how to report sanitized errors. Keep keys, cookies, `.env` and learner records out of course Q&A.

Hosted requirements such as OIDC, shared quotas/storage, billing caps, isolated uploads, cloud monitoring and external audit anchoring remain in RELEASE-GATES.md. They are not blockers for the loopback-only local distribution and are not claimed complete by this release workflow.
