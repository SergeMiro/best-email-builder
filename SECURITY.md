# Security policy

Please report vulnerabilities privately through GitHub's
"Report a vulnerability" (Security tab), not in a public issue.
We aim to acknowledge reports within a week.

The threat model is summarized in the README ("Security model"): templates
are validated against an allow-list and compiled on the server, uploaded
images are type-checked from their bytes and served with restrictive headers.
