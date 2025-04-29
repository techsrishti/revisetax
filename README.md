
## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.


## Instructions

- Do not create a new tailwind.config.ts or tailwind.config.js or tailwind.config.mjs file. It's no more necessary in Tailwind v4. 

- Please break down globals.css into layers or add specific CSS stylesheet for each page. For example, if you're working on app/dashboard/page.tsx, add the CSS styles corresponding to the dashboard at app/dashboard/styles.modules.css. See more [here](https://nextjs.org/docs/app/getting-started/css) and [here](https://www.reddit.com/r/nextjs/comments/16tvbu9/how_do_you_add_styles_to_your_pages/)

- Let's not completely rely on the root layout (app/layout.tsx). If the page or the component that you're building has any unique rerquirement, create a new layout.tsx. See more [here](https://nextjs.org/docs/app/getting-started/layouts-and-pages)

- DO NOT VIBE CODE the logic of the application. Verify any AI Generated code twice. 

- Before opening PR, please run ```pnpm run build```. Only open PR if the build succeeded. Tip: Run the build after commenting your .env. If the build failed after doing so, you're required to add the environment variable to github secrets and load that secret in .github/workflows/build.yml

- DO NOT PUSH SECRETS TO GITHUB. 

- As a best practice, do not create sub-directories to name API endpoints like app/api/creator/dashboard instead name it app/api/creator-dashboard. Only do so if you think it's absolutely necessary. 





