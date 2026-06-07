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

export type ApplicationReceivedRecruiterProps = {
  candidateName: string;
  candidateEmail: string;
  jobTitle: string;
  dashboardUrl: string;
};

export function applicationReceivedRecruiterSubject({
  candidateName,
  jobTitle,
}: Pick<ApplicationReceivedRecruiterProps, "candidateName" | "jobTitle">) {
  return `New application — ${candidateName} for ${jobTitle}`;
}

export function ApplicationReceivedRecruiter({
  candidateName,
  candidateEmail,
  jobTitle,
  dashboardUrl,
}: ApplicationReceivedRecruiterProps) {
  return (
    <Html>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>New application</Heading>
          <Text style={text}>
            <strong>{candidateName}</strong> applied for{" "}
            <strong>{jobTitle}</strong>.
          </Text>
          <Text style={text}>Candidate email: {candidateEmail}</Text>
          <Section style={{ marginTop: "24px" }}>
            <Button href={dashboardUrl} style={button}>
              Review candidate
            </Button>
          </Section>
          <Text style={{ ...muted, marginTop: "28px" }}>
            OpenHire notification
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
