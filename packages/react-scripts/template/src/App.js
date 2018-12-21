import React, { Component } from "react";
import Experiment, { registerTask } from "@blainelewis1/cefn";

registerTask("MyTask", () => import("./MyTask"));

function generateTrials(numCircles) {
  var tasks = [{ targetIndex: 0 }];

  for (var i = 0; i < numCircles - 1; i++) {
    tasks.push({
      targetIndex:
        (Math.floor(numCircles / 2) + tasks[tasks.length - 1].targetIndex) %
        numCircles
    });
  }

  return tasks;
}

const configuration = {
  children: [
    {
      task: "InformationScreen",
      content: `# Welcome to CEFN!
CEFN is an experimental framework built on React. It's modeled after create-react-app so you can get an experiment launched ASAP.

Take a look through this example experiment. It's also already hosted and ready to go, you're collecting data as you read!`
    },
    { task: "MyTask" },
    {
      task: "Fitts",
      width: 5,
      distance: 20,
      numTargets: 9,
      children: generateTrials(9)
    }
  ]
};

class App extends Component {
  render() {
    return (
      <div>
        <Experiment configuration={configuration} />
      </div>
    );
  }
}

export default App;
