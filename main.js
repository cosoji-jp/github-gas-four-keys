const githubEndpoint = "https://api.github.com/graphql";

const repositoryNames = JSON.parse(PropertiesService.getScriptProperties().getProperty("GITHUB_REPO_NAMES"));
const repositoryOwner = PropertiesService.getScriptProperties().getProperty("GITHUB_REPO_OWNER");
const githubAPIKey = PropertiesService.getScriptProperties().getProperty("GITHUB_API_TOKEN");

const defaultSheet = SpreadsheetApp.getActiveSpreadsheet();

function initialize() {

  const pullRequestsSheetName = "プルリク情報";
  const pullRequestsSheet = getOrCreateSheet(pullRequestsSheetName);
  pullRequestsSheet.getRange(1, 1, 1, 10)
    .setValues([[
      "メンバー名",
      "ブランチ名",
      "PR本文",
      "マージ済",
      "初コミット日時",
      "マージ日時",
      "マージまでの時間(分)",
      "リポジトリ",
      "障害発生判定",
      "障害対応PR",
    ]])
    .setBackgroundRGB(224, 224, 224);

  const settingsSheetName = "分析設定";
  const settingsSheet = getOrCreateSheet(settingsSheetName);

  settingsSheet.getRange(1, 1, 2, 2)
    .setValues([
      ["集計メンバー", "集計可否(TRUEかFALSEを入力してください)"],
      [`=unique('${pullRequestsSheetName}'!A2:A100000000)`, ""]
  ]);

  settingsSheet.getRange(1, 1, 1, 2)
    .setBackgroundRGB(224, 224, 224);

  settingsSheet.getRange(1, 4, 1, 2)
    .setValues([["キー名", "値"]])
    .setBackgroundRGB(224, 224, 224);

  settingsSheet.getRange(2, 4, 15, 2)
    .setValues([
      ["移動平均のウィンドウ幅(日)", "28"],
      ["修復/巻き直しPRのブランチ名の検索ルール(正規表現)", "hotfix|revert"],
      ["障害修復PRのブランチ名の検索ルール(正規表現)", "hotfix"],
      ["デプロイ頻度のElite判定条件(1日あたり平均N回以上PRがマージされていればElite)", "0.4285714286"],
      ["デプロイ頻度のHigh判定条件(1日あたり平均N回以上PRがマージされていればHigh)", "0.1428571429"],
      ["デプロイ頻度のMedium判定条件(1日あたり平均N回以上PRがマージされていればMedium)", "0.03333333333"],
      ["変更リードタイムのElite判定条件(修復/巻き戻しを除くPRが初コミットからマージされるまで平均N時間以内ならElite)", "24"],
      ["変更リードタイムのHigh判定条件(修復/巻き戻しを除くPRが初コミットからマージされるまで平均N時間以内ならHigh)", "168"],
      ["変更リードタイムのMedium判定条件(修復/巻き戻しを除くPRが初コミットからマージされるまで平均N時間以内ならMedium)", "720"],
      ["変更障害率のElite判定条件(全PRのうち修復/巻き戻しPRの割合がN%以下ならElite)", "0.15"],
      ["変更障害率のHigh判定条件(全PRのうち修復/巻き戻しPRの割合がN%以下ならHigh)", "0.3"],
      ["変更障害率のMedium判定条件(全PRのうち修復/巻き戻しPRの割合がN%以下ならMedium)", "0.45"],
      ["平均修復時間のElite判定条件(修復PRが初コミットからマージされるまで平均N時間以内ならElite)", "24"],
      ["平均修復時間のHigh判定条件(修復PRが初コミットからマージされるまで平均N時間以内ならHigh)", "168"],
      ["平均修復時間のMeidum定条件(修復PRが初コミットからマージされるまで平均N時間以内ならMedium", "720"],
    ]);

  const fourKeysSheetName = "FourKeys計測結果";
  const fourKeysSheet = getOrCreateSheet(fourKeysSheetName);
  const minutes = 60;

  fourKeysSheet.getRange(1, 1, 2, 9)
    .setValues([
      [
        "集計日",
        "デプロイ頻度", "",
        "変更のリードタイム", "",
        "変更失敗率", "",
        "平均復旧時間", ""
      ],
      [
        "",
        "回数", "ランク",
        "時間(hours)", "ランク",
        "割合(%)", "ランク",
        "時間(hours)", "ランク"
      ]])
    .setBackgroundRGB(
      224, 224, 224
    );
  const formatRanges = [
    fourKeysSheet.getRange("C3:C1000"),
    fourKeysSheet.getRange("E3:E1000"),
    fourKeysSheet.getRange("G3:G1000"),
    fourKeysSheet.getRange("I3:I1000")
  ];
  const rules = fourKeysSheet.getConditionalFormatRules();
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo("Elite")
    .setBackground("#b7e1cd")
    .setRanges(formatRanges)
    .build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo("High")
    .setBackground("#c9daf8")
    .setRanges(formatRanges)
    .build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo("Low")
    .setBackground("#f4cccc")
    .setRanges(formatRanges)
    .build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo("Medium")
    .setBackground("#fff2cc")
    .setRanges(formatRanges)
    .build());
  fourKeysSheet.setConditionalFormatRules(rules);

  fourKeysSheet.getRange(3, 2, 1, 8)
    .setValues([[
      `=SUM(MAP('${settingsSheetName}'!B$2:B$1000, '${settingsSheetName}'!A$2:A$1000, LAMBDA(b, a, IF(OR(b<>FALSE, ISBLANK(b)), COUNTIFS('${pullRequestsSheetName}'!F$2:F$100000000, ">=" & A3-'${settingsSheetName}'!E$2,'${pullRequestsSheetName}'!F$2:F$100000000, "<" & A3, '${pullRequestsSheetName}'!I$2:I$100000000, FALSE, '${pullRequestsSheetName}'!A$2:A$100000000, a), 0))))/'${settingsSheetName}'!E$2`,
      `=IFS(B3>='${settingsSheetName}'!E$5, "Elite", B3>='${settingsSheetName}'!E$6, "High", B3>='${settingsSheetName}'!E$7, "Medium", TRUE, "Low")`,
      `=IF(B3 > 0, SUM(MAP('${settingsSheetName}'!B$2:B$1000, '${settingsSheetName}'!A$2:A$1000, LAMBDA(b, a, IF(OR(b<>FALSE, ISBLANK(b)), SUMIFS('${pullRequestsSheetName}'!G$2:G$100000000, '${pullRequestsSheetName}'!F$2:F$100000000, ">=" & A3-'${settingsSheetName}'!E$2,'${pullRequestsSheetName}'!F$2:F$100000000, "<" & A3, '${pullRequestsSheetName}'!I$2:I$100000000, FALSE, '${pullRequestsSheetName}'!A$2:A$100000000, a)/${minutes}, 0)))) / (B3*'${settingsSheetName}'!E$2), 0)`,
      `=IFS(D3<='${settingsSheetName}'!E$8, "Elite", D3<='${settingsSheetName}'!E$9, "High", D3<='${settingsSheetName}'!E$10, "Medium", TRUE, "Low")`,
      `=IF(B3 > 0, SUM(MAP(${settingsSheetName}!B$2:B$1000, ${settingsSheetName}!A$2:A$1000, LAMBDA(b, a, IF(OR(b<>FALSE, ISBLANK(b)), COUNTIFS('${pullRequestsSheetName}'!F$2:F$100000000, ">=" & A3-'${settingsSheetName}'!E$2,'${pullRequestsSheetName}'!F$2:F$100000000, "<" & A3, '${pullRequestsSheetName}'!I$2:I$100000000, TRUE, '${pullRequestsSheetName}'!A$2:A$100000000, a), 0))))/(B3*'${settingsSheetName}'!E$2), 0)`,
      `=IFS(F3<='${settingsSheetName}'!E$11, "Elite", F3<='${settingsSheetName}'!E$12, "High", F3<='${settingsSheetName}'!E$13, "Medium", TRUE, "Low")`,
      `=IF(SUM(MAP(${settingsSheetName}!B$2:B$1000, ${settingsSheetName}!A$2:A$1000, LAMBDA(b, a, IF(OR(b<>FALSE, ISBLANK(b)), COUNTIFS('${pullRequestsSheetName}'!F$2:F$100000000, ">=" & A3-'${settingsSheetName}'!E$2,'${pullRequestsSheetName}'!F$2:F$100000000, "<" & A3, '${pullRequestsSheetName}'!J$2:J$100000000, TRUE, '${pullRequestsSheetName}'!A$2:A$100000000, a))))) > 0, SUM(MAP(${settingsSheetName}!B$2:B$1000, ${settingsSheetName}!A$2:A$1000, LAMBDA(b, a, IF(OR(b<>FALSE, ISBLANK(b)), SUMIFS('${pullRequestsSheetName}'!G$2:G$100000000, '${pullRequestsSheetName}'!F$2:F$100000000, ">=" & A3-'${settingsSheetName}'!E$2,'${pullRequestsSheetName}'!F$2:F$100000000, "<" & A3, '${pullRequestsSheetName}'!J$2:J$100000000, TRUE, '${pullRequestsSheetName}'!A$2:A$100000000, a)))))/60/SUM(MAP(${settingsSheetName}!B$2:B$1000, ${settingsSheetName}!A$2:A$1000, LAMBDA(b, a, IF(OR(b<>FALSE, ISBLANK(b)), COUNTIFS('${pullRequestsSheetName}'!F$2:F$100000000, ">=" & A3-'${settingsSheetName}'!E$2,'${pullRequestsSheetName}'!F$2:F$100000000, "<" & A3, '${pullRequestsSheetName}'!J$2:J$100000000, TRUE, '${pullRequestsSheetName}'!A$2:A$100000000, a))))), 0)`,
      `=IFS(H3<='${settingsSheetName}'!E$14, "Elite", H3<='${settingsSheetName}'!E$15, "High", H3<='${settingsSheetName}'!E$16, "Medium", TRUE, "Low")`
    ]])
    .setNumberFormats([[
      "#,##0.00", "@",
      "#,##0.00", "@",
      "0.00%", "@",
      "#,##0.00", "@",
    ]]);
  fourKeysSheet.getRange(3, 2, 1, 8).copyTo(
    fourKeysSheet.getRange(4, 2, 4, 8)
  );
  const today = new Date();
  fourKeysSheet.getRange(3, 1, 5, 1).setValues(
    [4,3,2,1,0].map((numberOfTwoWeek) => [Utilities.formatDate(new Date(new Date().setDate(today.getDate() - 14*numberOfTwoWeek)), "JST", "yyyy-MM-dd")])
  );
  fourKeysSheet.getRange(8, 1, 1, 1).setValues([
    ["移行のデータの統計値を取得する場合はB~I列を上からペーストしA列は任意の値を入力てください。"]
  ]);

  const dfLtChart = fourKeysSheet.newChart()
    .addRange(fourKeysSheet.getRange("A1:A1000"))
    .addRange(fourKeysSheet.getRange("B1:B1000"))
    .addRange(fourKeysSheet.getRange("D1:D1000"))
    .setChartType(Charts.ChartType.COMBO)
    .setNumHeaders(1)
    .setOption("title", "デプロイ頻度と変更リードタイム")
    .setOption("series",[
      { targetAxisIndex: 0, legend: "デプロイ頻度(1日あたり)"},
      { targetAxisIndex: 1, legend: "変更リードタイム"},
    ])
    .setOption("vAxes", [
      {
        title: "回数",
        minValue: 0
      },
      {
        title: "時間",
        minValue: 0
      },
    ])
    .setOption("hAxes", {
      title: "Week"
    })
    .setPosition(1, 10, 0, 0)
    .build();
  fourKeysSheet.insertChart(dfLtChart);

  const incidentChart = fourKeysSheet.newChart()
    .addRange(fourKeysSheet.getRange("A1:A1000"))
    .addRange(fourKeysSheet.getRange("F1:F1000"))
    .addRange(fourKeysSheet.getRange("H1:H1000"))
    .setChartType(Charts.ChartType.COMBO)
    .setNumHeaders(1)
    .setOption("title", "変更障害率と平均復旧時間")
    .setOption("series",[
      { targetAxisIndex: 0, legend: "変更障害率"},
      { targetAxisIndex: 1, legend: "平均修復時間"},
    ])
    .setOption("vAxes", [
      {
        title: "％",
        minValue: 0
      },
      {
        title: "時間",
        minValue: 0
      },
    ])
    .setOption("hAxes", {
      title: "Week"
    })
    .setPosition(20, 10, 0, 0)
    .build();
  fourKeysSheet.insertChart(incidentChart);
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === "getAllRepos").forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("getAllRepos")
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(0)
    .create();
}

function getAllRepos() {

  let i = 0;
  repositoryNames.forEach((repositoryName) => {
    const pullRequests = getPullRequests(repositoryName);

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(`プルリク情報`);
    for (const pullRequest of pullRequests.length) {

      let firstCommitDate = null;
      if (pullRequest.commits.nodes[0].commit.committedDate) {
        firstCommitDate = new Date(pullRequest.commits.nodes[0].commit.committedDate);
      }
      let mergedAt = null;
      if (pullRequest.mergedAt) {
        mergedAt = new Date(pullRequest.mergedAt);
      }
      sheet.getRange(i+2, 1).setValue(pullRequest.author.login);
      sheet.getRange(i+2, 2).setValue(pullRequest.headRefName);
      sheet.getRange(i+2, 3).setValue(pullRequest.bodyText);
      sheet.getRange(i+2, 4).setValue(pullRequest.merged);
      if (firstCommitDate) sheet.getRange(i+2, 5).setValue(formatDate(firstCommitDate));
      if (mergedAt) sheet.getRange(i+2, 6).setValue(formatDate(mergedAt));
      if (firstCommitDate && mergedAt) sheet.getRange(i+2, 7).setValue((mergedAt.getTime() - firstCommitDate.getTime()) / 60 / 1000);
      sheet.getRange(i+2, 8).setValue(repositoryName);
      sheet.getRange(i+2, 9).setValue(`=REGEXMATCH(B${i+2}, '分析設定'!$E$3)`);
      sheet.getRange(i+2, 10).setValue(`=REGEXMATCH(B${i+2}, '分析設定'!$E$4)`);

      i++;
    }
  });
}

function getPullRequests(repositoryName) {
  /*
   指定したリポジトリから全てのPRを抽出する.
  */
  let resultPullRequests = [];
  let after = "";
  while (true) {
    const graphql = `query{
      repository(name: "${repositoryName}", owner: "${repositoryOwner}"){
        pullRequests (first: 100 ${after}) {
          pageInfo {
            startCursor
            hasNextPage
            endCursor
          }
          nodes {
            author {
              login
            }
            headRefName
            bodyText
            merged
            mergedAt
            commits (first: 1) {
              nodes {
                commit {
                  committedDate
                }
              }
            }
          }
        }
      }
    }`;
    const option = {
      method: 'post',
      contentType: 'application/json',
      headers: {
        Authorization: 'bearer ' + githubAPIKey
      },
      payload: JSON.stringify({query: graphql}),
    };
    const res = UrlFetchApp.fetch(githubEndpoint, option);
    const json = JSON.parse(res.getContentText());
    resultPullRequests = resultPullRequests.concat(json.data.repository.pullRequests.nodes)
    if (!json.data.repository.pullRequests.pageInfo.hasNextPage) {
      break;
    }
    after = ', after: "' + json.data.repository.pullRequests.pageInfo.endCursor + '"';
  }

  return resultPullRequests;
}

function formatDate(date) {
  /*
   日付フォーマットヘルパ関数
  */
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const hour = date.getHours().toString().padStart(2, '0');
  const minute = date.getMinutes().toString().padStart(2, '0');
  const second = date.getSeconds().toString().padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

function getOrCreateSheet(sheetName) {
  return defaultSheet.getSheetByName(sheetName) || defaultSheet.insertSheet(sheetName);
}
