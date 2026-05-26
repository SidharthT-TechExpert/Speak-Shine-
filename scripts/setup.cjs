const fs = require('fs');
const path = require('path');

const files = [
  {
    example: '.env.example',
    target: '.env',
  },
  {
    example: 'backend/config/dev.config.example.js',
    target: 'backend/config/dev.config.js',
  },
];

files.forEach(({ example, target }) => {
  const examplePath = path.join(__dirname, '..', example);
  const targetPath = path.join(__dirname, '..', target);

  if (!fs.existsSync(examplePath)) {
    console.warn(`Template not found: ${example}`);
    return;
  }

  if (!fs.existsSync(targetPath)) {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(examplePath, targetPath);
    console.log(`Created: ${target}`);
  } else {
    console.log(`Already exists: ${target}`);
  }
});

console.log('Setup completed.');
