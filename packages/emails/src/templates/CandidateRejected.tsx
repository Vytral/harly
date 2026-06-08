import { Body, Container, Heading, Html, Text } from "@react-email/components";

import { container, heading, main, muted, text } from "./styles";

export type CandidateRejectedProps = {
  candidateName: string;
  jobTitle: string;
  companyName: string;
  customMessage?: string;
};

export function candidateRejectedSubject({
  jobTitle,
}: Pick<CandidateRejectedProps, "jobTitle">) {
  return `Your application for ${jobTitle}`;
}

export function CandidateRejected({
  candidateName,
  jobTitle,
  companyName,
  customMessage,
}: CandidateRejectedProps) {
  return (
    <Html>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Application update</Heading>
          <Text style={text}>Hi {candidateName},</Text>
          <Text style={text}>
            Thank you for your interest in <strong>{jobTitle}</strong> at{" "}
            {companyName}.
          </Text>
          <Text style={text}>
            {customMessage ??
              "After careful consideration, we will not be moving forward with your application at this time."}
          </Text>
          <Text style={text}>
            We appreciate the time you invested and wish you the best in your
            search.
          </Text>
          <Text style={{ ...muted, marginTop: "28px" }}>
            Sent by Harly on behalf of {companyName}.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
