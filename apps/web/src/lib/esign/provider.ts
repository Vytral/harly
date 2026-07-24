import "server-only";

export type SignatureSecurityMode = "link_only" | "email_otp" | "sso";

export type SignatureProviderCapabilities = {
  supportsSelfSign: boolean;
  supportsRemoteSign: boolean;
  supportsOtp: boolean;
  supportsMultipleRecipients: boolean;
  supportsExternalAuditTrail: boolean;
};

export type CreateProviderEnvelopeInput = {
  workspaceId: string;
  documentId: string;
  subject: string;
  recipients: Array<{
    email: string;
    name: string;
    role?: string;
    routingOrder?: number;
  }>;
};

export type ProviderEnvelope = {
  provider: string;
  providerEnvelopeId: string;
  status: "created" | "sent" | "completed" | "declined" | "voided";
};

/**
 * Common provider seam. Domain code owns permissions, evidence, versions and
 * lifecycle; providers only implement transport/signing mechanics.
 */
export interface SignatureProvider {
  readonly name: string;
  readonly capabilities: SignatureProviderCapabilities;
  createEnvelope(input: CreateProviderEnvelopeInput): Promise<ProviderEnvelope>;
  send(envelopeId: string): Promise<void>;
  sign(input: { envelopeId: string; recipientId: string }): Promise<void>;
  cancel(envelopeId: string): Promise<void>;
  getStatus(envelopeId: string): Promise<ProviderEnvelope["status"]>;
}
