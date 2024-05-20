const fs = require("fs/promises");
const path = require("path");

async function writeFileWithRecursiveDirs(file, data) {
  try {
    await fs.writeFile(file, data, { flags: "w+", encoding: "utf-8" });
  } catch (error) {
    async function mkdir(dir) {
      try {
        await fs.mkdir(dir);
      } catch (error) {
        mkdir(path.dirname(dir));
      }
    }
    mkdir(path.dirname(file));
    writeFileWithRecursiveDirs(file, data);
  }
}

const caseNames = process.argv.slice(2);

const backups = {};

function insert(filePath) {
  next.promise = fs
    .readFile(path.join(__dirname, "../" + filePath), {
      encoding: "utf-8",
    })
    .then((fileContent) => {
      backups[filePath] = fileContent;
      return [fileContent, filePath];
    });

  function next(pin, insertTag) {
    next.promise = new Promise((resolve) => {
      next.promise.then(([fileContent]) => {
        const newFileContent = fileContent.replace(pin, () => {
          const inserted = caseNames
            .map((caseName) => insertTag`${caseName}`)
            .join("\n");
          return inserted + "\n" + pin;
        });
        resolve([newFileContent, filePath]);
      });
    });

    return next;
  }

  return next;
}

(async () => {
  const inserteds = [
    insert("/demo/demo.worker.ts")(
      "  // Insert ActionTypes above this line",
      (_, caseName) => `  ${caseName}: () => ActionResult\n`
    )(
      "  // Insert Actions above this line",
      (_, caseName) => `  async ${caseName}() {},\n`
    ).promise,
    insert("/demo/demo.main.ts")(
      "// Insert Ports above this line",
      (_, caseName) =>
        `export const ${caseName}Port = worker.execute("${caseName}");\n`
    ).promise,
    insert("/test/main.test.ts")(
      "  // Insert Ports to be imported above this line.",
      (_, caseName) => `  ${caseName}Port,`
    )(
      "  // Insert test cases above this line.",
      (_, caseName) => `  it("${caseName}", async function () {});\n`
    ).promise,
  ];

  inserteds.forEach((promise) => {
    promise.then((res) => {
      console.log(res[1] + " 添加 case 成功，正在准备写入......");
    });
  });

  const newContents = await Promise.all(inserteds);

  // 将原始文件内容放入 /scripts/backups 中备份
  for (k in backups) {
    const filePath = path.join(__dirname, "/backups" + k);
    await writeFileWithRecursiveDirs(filePath, backups[k]);
  }

  console.log("");

  // 修改目标文件
  await Promise.all(
    newContents.map(async (newContent) => {
      await writeFileWithRecursiveDirs(
        path.join(__dirname, "../" + newContent[1]),
        newContent[0]
      );
      console.log(`${newContent[1]} 写入成功!`);
    })
  );

  console.log("\n所有 case 添加完成!");
})();
