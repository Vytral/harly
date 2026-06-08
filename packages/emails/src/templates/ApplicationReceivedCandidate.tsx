import {
  Body,
  Button,
  Container,
  Heading,
  Html,
  Section,
  Text,
} from "@react-email/components";

import { button, container, heading, main, muted, text } from "./styles";

export type ApplicationReceivedCandidateProps = {
  candidateName: string;
  jobTitle: string;
  companyName: string;
  jobBoardUrl?: string;
};

export function applicationReceivedCandidateSubject({
  jobTitle,
}: Pick<ApplicationReceivedCandidateProps, "jobTitle">) {
  return `We received your application — ${jobTitle}`;
}

export function ApplicationReceivedCandidate({
  candidateName,
  jobTitle,
  companyName,
  jobBoardUrl,
}: ApplicationReceivedCandidateProps) {
  return (
    <Html>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Application received</Heading>
          <Text style={text}>Hi {candidateName},</Text>
          <Text style={text}>
            Thanks for applying to <strong>{jobTitle}</strong> at {companyName}.
            We received your application and the hiring team will review it.
          </Text>
          <Text style={text}>
            If there is a fit, {companyName} will follow up with next steps.
          </Text>
          {jobBoardUrl ? (
            <Section style={{ marginTop: "24px" }}>
              <Button href={jobBoardUrl} style={button}>
                View open roles
              </Button>
            </Section>
          ) : null}
          <Text style={{ ...muted, marginTop: "28px" }}>
            Sent by Harly on behalf of {companyName}.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
