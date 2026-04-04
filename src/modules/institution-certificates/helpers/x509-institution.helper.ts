import * as forge from 'node-forge';
import { v4 as uuidv4 } from 'uuid';

export interface InstitutionCertSubject {
  institutionName: string;
  institutionId: string;
}

export interface BuildInstitutionCertResult {
  certificatePem: string;
  serialNumber: string;
  notBefore: Date;
  notAfter: Date;
  subjectCN: string;
}

/**
 * Builds and self-signs an X.509 v3 institutional certificate.
 * Subject reflects the institution, not an individual.
 * In production (CloudHSM): the cert.sign() call is replaced by HSM PKCS#11.
 */
export function buildInstitutionX509(
  subject: InstitutionCertSubject,
  publicKeyPem: string,
  privateKeyPem: string,
  validityYears = 2,
): BuildInstitutionCertResult {
  const serialNumber = uuidv4().replace(/-/g, '').toUpperCase();
  const notBefore = new Date();
  const notAfter = new Date();
  notAfter.setFullYear(notAfter.getFullYear() + validityYears);

  const cert = forge.pki.createCertificate();
  cert.publicKey = forge.pki.publicKeyFromPem(publicKeyPem);
  cert.serialNumber = serialNumber;
  cert.validity.notBefore = notBefore;
  cert.validity.notAfter = notAfter;

  const attrs = [
    { name: 'commonName', value: subject.institutionName },
    { name: 'organizationName', value: 'ID Verification Platform' },
    { name: 'organizationalUnitName', value: 'Institutional Certificate' },
    { name: 'countryName', value: 'RW' },
  ];

  cert.setSubject(attrs);
  cert.setIssuer(attrs);

  cert.setExtensions([
    { name: 'basicConstraints', cA: false },
    { name: 'keyUsage', digitalSignature: true, nonRepudiation: true },
    {
      name: 'subjectAltName',
      altNames: [{ type: 2, value: subject.institutionId }],
    },
  ]);

  cert.sign(
    forge.pki.privateKeyFromPem(privateKeyPem),
    forge.md.sha256.create(),
  );

  return {
    certificatePem: forge.pki.certificateToPem(cert),
    serialNumber,
    notBefore,
    notAfter,
    subjectCN: subject.institutionName,
  };
}
