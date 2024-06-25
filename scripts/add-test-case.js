const fs = require("fs/promises");
const path = require("path");

/**
 * 将数据写入给定路径的文件，如果文件所在的目录不存在，则递归创建它
 * @param {string} filePath 文件的绝对路径
 * @param {string} data 写入的数据
 */
async function writeFileWithRecursiveDirs(filePath, data) {
  try {
    await fs.writeFile(filePath, data, { flags: "w+", encoding: "utf-8" });
  } catch (error) {
    async function mkdir(dir) {
      try {
        await fs.mkdir(dir);
      } catch (error) {
        mkdir(path.dirname(dir));
      }
    }
    mkdir(path.dirname(filePath));
    writeFileWithRecursiveDirs(filePath, data);
  }
}

// backups 中存放要备份的原始文件的数据
const backups = {};

// backupsPath 是备份文件所在的目录
const backupsPath = path.join(__dirname, "/backups");

/**
 * 柯里化地将需要的内容插入到指定文件中，一个文件可以插入多段内容
 * @param {*} filePath 要插入内容的文件路径
 * @param {*} caseNames 要插入的 case 名称
 * @returns {next} next 函数，每调用一次则给指定文件插入一段内容
 */
function insert(filePath, caseNames) {
  next.promise = fs
    .readFile(path.join(__dirname, "../" + filePath), {
      encoding: "utf-8",
    })
    .then((fileContent) => {
      backups[filePath] = fileContent;
      return [fileContent, filePath];
    });

  /**
   * 根据 pin 和 insertTag 为文件生成插入后的内容
   * @param {string} pin 要插入的定位字符串
   * @param {Function} insertTag 要插入的模板字符串标签
   * @returns {next} next 函数，每调用一次则给指定文件插入一段内容
   */
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

/**
 * 执行插入操作
 * @param {string[]} caseNames 要插入的 case 的名称
 */
async function execute(caseNames) {
  // 返回插入后的内容的 Promise 放入到 inserteds 数组中
  const inserteds = [
    insert("/demo/demo.worker.ts", caseNames)(
      "  // Insert ActionTypes above this line",
      (_, caseName) => `  ${caseName}: () => ActionResult\n`
    )(
      "  // Insert Actions above this line",
      (_, caseName) => `  async ${caseName}() {},\n`
    ).promise,

    insert("/demo/demo.main.ts", caseNames)(
      "// Insert Executors above this line",
      (_, caseName) =>
        `export const ${caseName}Executor = () => worker.execute("${caseName}");\n`
    ).promise,

    insert("/test/main.test.ts", caseNames)(
      "  // Insert Executors to be imported above this line.",
      (_, caseName) => `  ${caseName}Executor,`
    )(
      "  // Insert test cases above this line.",
      (_, caseName) =>
        `  describe("${caseName}", function () {
    let ${caseName}Port: ReturnType<
      typeof ${caseName}Executor
    >;

    it("event", function () {
      ${caseName}Port = ${caseName}Executor();

    });

    it("promise", async function () {
      const { data } = await ${caseName}Port.promise;

    });
  });\n`
    ).promise,
  ];

  // 获取到所有的修改后的文件内容
  const newContents = await Promise.all(inserteds);

  // 将原始文件内容放入 /scripts/backups 中备份
  await fs.rm(backupsPath, { recursive: true });
  for (k in backups) {
    const filePath = path.join(__dirname, "/backups" + k);
    await writeFileWithRecursiveDirs(filePath, backups[k]);
  }

  console.log("");

  // 将修改后的内容写入到目标文件中，全部写入成功后再执行下一步
  await Promise.all(
    newContents.map(async (newContent) => {
      await writeFileWithRecursiveDirs(
        path.join(__dirname, "../" + newContent[1]),
        newContent[0]
      );
      console.log(`${newContent[1]} 写入成功！`);
    })
  );
}

const readline = require("readline/promises");
const { emitKeypressEvents } = require("readline");

(async () => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const rlo = new readline.Readline(rl.output);
  rl.write("请输入需要添加的 case 名称，如需添加多个，则使用空格分隔：\n");
  rl.prompt();

  rl.on("line", afterInputCaseNames);

  /**
   * 输入 case 名称后执行的回调
   * @param {string} input
   * @returns
   */
  async function afterInputCaseNames(input) {
    rl.removeAllListeners();

    const caseNames = [
      ...new Set(
        input
          .split(" ")
          .filter((item) =>
            /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(item) ? item : null
          )
      ),
    ];

    if (caseNames.length === 0) {
      rl.write("请输入合法的变量名作为 case 的名称：\n");
      rl.prompt();
      rl.on("line", afterInputCaseNames);
      return;
    }

    rl.removeAllListeners();

    console.log();
    await execute(caseNames);
    console.log("\n所有 case 添加完成！");
    console.log(`\n备份文件位于 ${backupsPath} 中`);
    console.log("是否确定本次插入操作生效？<y/n>");
    rl.prompt();
    let current = "y";
    rl.write(current);
    rl.on("line", confirm);

    emitKeypressEvents(rl.input);
    if (rl.input.isTTY) rl.input.setRawMode(true);

    rl.input.on("keypress", async (_, key) => {
      if (
        key.name === "up" ||
        key.name === "down" ||
        key.name === "left" ||
        key.name === "right"
      ) {
        rlo.cursorTo(2);
        rlo.clearLine(1);
        current = current === "n" ? "y" : "n";
        await rlo.commit();
        rl.line = "";
        rl.write(current);
      }
    });
  }

  /**
   * 确认插入操作后的回调
   * @param {string} input
   */
  async function confirm(input) {
    rl.input.removeAllListeners();
    if (rl.input.isTTY) rl.input.setRawMode(false);
    rl.removeAllListeners();
    if (/^y/i.test(input)) process.exit();
    await fs.cp(
      path.join(__dirname, "./backups/"),
      path.join(__dirname, "../"),
      { recursive: true }
    );
    console.log("本次操作已撤销！");
    process.exit();
  }
})();
