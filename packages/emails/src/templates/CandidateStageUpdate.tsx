import { Body, Container, Heading, Html, Text } from "@react-email/components";

import { container, heading, main, muted, text } from "./styles";

export type CandidateStageUpdateProps = {
  candidateName: string;
  jobTitle: string;
  stageName: string;
  companyName: string;
};

export function candidateStageUpdateSubject({
  jobTitle,
}: Pick<CandidateStageUpdateProps, "jobTitle">) {
  return `Update on your application — ${jobTitle}`;
}

export function CandidateStageUpdate({
  candidateName,
  jobTitle,
  stageName,
  companyName,
}: CandidateStageUpdateProps) {
  return (
    <Html>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Application update</Heading>
          <Text style={text}>Hi {candidateName},</Text>
          <Text style={text}>
            Your application for <strong>{jobTitle}</strong> at {companyName} has
            moved to a new stage: <strong>{stageName}</strong>.
          </Text>
          <Text style={text}>
            This is a general status update. The hiring team will reach out if
            they need anything else from you.
          </Text>
          <Text style={{ ...muted, marginTop: "28px" }}>
            Sent by OpenHire on behalf of {companyName}.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
