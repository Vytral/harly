// esbuild embeds .yaml files as text (see the `build` script).
declare module "*.yaml" {
  const contents: string;
  export default contents;
}
