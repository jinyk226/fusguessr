# Agent Guidelines for Production-Ready Repos

## Core Principles
1. Always prioritize conventional approaches before considering workarounds
2. Investigate root causes of failures before implementing fixes
3. Document all workarounds in the WORKAROUNDS directory
4. Maintain atomic commits with clear purpose
5. Use semantic commit messages (e.g., feat/, fix/, docs/)
6. Keep commit history linear and clean
7. Write tests for all new functionality
8. Maintain 100% test coverage for critical paths
9. Use feature flags for experimental changes
10. Follow semantic versioning for releases

## Workaround Documentation Standards
- Each workaround must have:
  - Context: Why the conventional approach failed
  - Problem: Detailed description of the issue
  - Fix: Step-by-step implementation
  - Pitfalls: Known limitations/risk areas
  - Verification: How to validate the solution

## Branching Strategy
- Use Git Flow with protected main branch
- Feature branches must be reviewed before merging
- Use pull requests for all changes
- Maintain a clean, linear history
- Rebase frequently with main branch

## Code Quality
- Follow Prettier and ESLint configurations
- Maintain consistent code style
- Write comprehensive documentation
- Use JSDoc for public APIs
- Keep files under 500 lines
- Use TypeScript for new features
- Maintain 80% code coverage minimum

## Release Process
- Use semantic versioning (SemVer)
- Create changelogs for each release
- Use GitHub Releases for distribution
- Maintain a release checklist
- Conduct thorough testing before release
- Monitor production for post-release issues