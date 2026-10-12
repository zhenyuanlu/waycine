# Security policy

## Supported versions

Fixes go to the `main` branch. Once versions are published, the latest
release is the supported one.

## Reporting a vulnerability

Please do not open a public issue for a security problem. Report it in
private through GitHub's private vulnerability reporting: open the
[Security tab](https://github.com/zhenyuanlu/waycine/security) of the
repository and choose "Report a vulnerability". The report is visible only
to the maintainers.

Say what you found, how to reproduce it (a project file or a share link
helps) and which browser or Node.js version you used.

## What is in scope

- The web app's handling of untrusted input: share links, project files,
  imported lists, uploaded fonts and the answers of the place-search
  services.
- The command line: the files it writes and the way it starts ffmpeg.
- The published packages `waycine` and `@waycine/cli`.

The web app has no server and no accounts, and it uploads nothing. The
[Privacy section of the README](README.md#privacy) lists the only network
requests it makes.
