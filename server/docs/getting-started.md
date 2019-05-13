# Counterfactual Getting Started Guide

## Introduction

Counterfactual is a web development framework that makes it easy to build dapps on Ethereum that take advantage of state channels. State channels are an “off-chain” or “layer 2” technique that allow your dapp to be instant and fee-less, while still retaining the security of an on-chain application.

State channels are useful for any dapp that relies on turn-based state updates between a fixed set of users that conditionally execute a transaction based on that state. For instance, a board game dapp where users take turns applying actions to the board until a winner emerges and is rewarded with some money.

In this guide, we’ll build a simple game using the Counterfactual framework. The game is called High Roller: a dice game where two users stake ETH, roll two dice, and the one with the higher roll wins all of the staked money.

## How does Counterfactual work?

### For Users

Users interact with Counterfactual dapps through their wallet-enabled web browser. In this Getting Started Guide, we'll be using  MetaMask and the Counterfactual MetaMask plugin. Check out the installation guide [here](https://github.com/counterfactual/monorepo/tree/master/packages/cf-metamask-extension).

INSERT DIAGRAM-USER HERE

Counterfactual is designed build web apps with a [hub-and-spoke model](https://medium.com/blockchannel/state-channels-for-dummies-part-3-10b25f6c08b). For us just means that each user already has an established ledger channel with a server-like entity we call the Intermediary. Each user's browser wallet will contain a dedicated ethereum address that contains available funds for dapps hosted by a given Intermediary. In this Getting Started Guide, we'll use the Counterfactual Playground Server as our Intermediary; you can sign up for an account [here](https://playground.counterfactual.com/).

When two users agree to install an instance of a dapp via the Playground, the Playground will allocate funds from their dedicated addresses into a virtual channel for the dapp instance.

INSERT DIAGRAM FUNDVCHANN HERE


### For Developers


Developers will use the Counterfactual framework to implement the logic of virtual state channels. In this Getting Started Guide, you'll learn how to 

1. designate the **application logic** for the virtual channel
1. design the **user interface** for the virtual channel

The application logic for a Counterfactual dapp is described in a deployed Ethereum contract. Functionality handled includes answering the following questions:

1. Whose turn is it now?
2. What are the possible actions a user can legally execute?
3. When is the game over?
4. What happens to the stake when the game is over?

In this guide, we've provided you with a deployed contract, [HighRoller.sol](https://github.com/counterfactual/monorepo/blob/master/packages/apps/contracts/HighRollerApp.sol), to use for your dapp. Take a quick look at **HighRoller.sol** and see if you can find how it answers questions 1-4. We'll also run through this together in the next [section](https://github.com/counterfactual/website/blob/joey-editing/server/docs/getting-started.md#a-quick-look-at-the-contract).


The UI and client logic for the game will be implemented in **app.js**. Functionality handled includes:

1. Proposing a game to another user
2. Accepting a proposal from another user
3. Taking an action when it is your turn
4. Listening for other players to take their turns
5. Leaving a game when it’s over


### In this Getting Start Guide, you’ll learn how to:

1. Create a new Counterfactual project repo
1. Create an `AppFactory` instance, which will specify the application logic for **HighRoller**
1. Use the `AppFactory`'s method `proposeInstallVirtual()` to propose a new virtual state channel when the user wants to play **HighRoller**
1. Use the Counterfactual `NodeProvider`'s method `on()` to listen for the second player to accept the proposed virtual install
1. Use the Counterfactual `NodeProvider`'s method `on()` to listen for updated state in the virtual channel
1. Use the `AppInstance`'s `takeAction()` method to [update state](https://specs.counterfactual.com/en/latest/01-app-definition.html#progressing-state) in the virtual channel
1. Use the `AppInstance`'s `uninstall()` method to close and resolve the virtual channel

Along the way, we'll see how the Counterfactual framework ensures that state is updated safely and securely. 

One more thing: to streamline your first dapp, we've built and deployed a bot that will accept `proposeInstallVirtual()` requests for **HighRoller** and play the game with your user. This means you only have to code the UI for the first player of **HighRoller**.



---------

## A Quick Look at the Contract

Let's take a quick look at the [HighRoller.sol](https://github.com/counterfactual/monorepo/blob/master/packages/apps/contracts/HighRollerApp.sol) contract to see how the game logic is structured.

### Game logic for HighRoller.sol

We want to make our dice game very secure: the application logic requires both users to submit a random number -- the product of the two numbers is used as the source of randomness for both players' dice rolls; this is what makes it secure. In order to prevent the second player from using information about the first player's number, we use a commit-by-hash and reveal paradigm:
  * The first player submits a **hash** of their **number** with a random **salt**
  * The second player submits their **number**
  * The first player **reveals** their number by submitting the number and the salt, which are checked against the original hash
  * The contract generates die rolls for each player

The information above is enough to determine the structure of the **HighRoller** `AppState` and `Action`, both of which are required for Counterfactual Apps. We also note the data structures `ActionType` and `Stage` that the contract developer chose to create:

```solidity
contract HighRollerApp is CounterfactualApp {

  enum ActionType {
    START_GAME,
    COMMIT_TO_HASH,
    COMMIT_TO_NUM,
    REVEAL
  }

  enum Stage {
    PRE_GAME,
    COMMITTING_HASH,
    COMMITTING_NUM,
    REVEALING,
    DONE
  }

  enum Player {
    FIRST,
    SECOND
  }

  struct AppState {
    address[2] playerAddrs;
    Stage stage;
    bytes32 salt;
    bytes32 commitHash;
    uint256 playerFirstNumber;
    uint256 playerSecondNumber;
  }

  struct Action {
    ActionType actionType;
    uint256 number;
    bytes32 actionHash;
  }
```

Because it’s such a simple game (Player1 → Player2 → Player1 → DONE), `getTurnTaker()` and `isStateTerminal()` are easy to implement:

```solidity
function isStateTerminal(AppState memory state)
  public
  pure
  returns (bool)
{
  return state.stage == Stage.DONE;
}

function getTurnTaker(AppState memory state)
  public
  pure
  returns (Player)
{
  return state.stage == Stage.COMMITTING_NUM ? Player.SECOND : Player.FIRST;
}
```

Actions for the game are defined (and constrained) in the `applyAction` function:

```solidity
function applyAction(AppState memory state, Action memory action)
  public
  pure
  returns (bytes memory)
{
  AppState memory nextState = state;
  if (action.actionType == ActionType.START_GAME) {
    require(
      state.stage == Stage.PRE_GAME,
      "Cannot apply START_GAME on PRE_GAME"
    );
    nextState.stage = Stage.COMMITTING_HASH;
  } else if (action.actionType == ActionType.COMMIT_TO_HASH) {
    require(
      state.stage == Stage.COMMITTING_HASH,
      "Cannot apply COMMIT_TO_HASH on COMMITTING_HASH"
    );
    nextState.stage = Stage.COMMITTING_NUM;

    nextState.commitHash = action.actionHash;
  } else if (action.actionType == ActionType.COMMIT_TO_NUM) {
    require(
      state.stage == Stage.COMMITTING_NUM,
      "Cannot apply COMMITTING_NUM on COMMITTING_NUM"
    );
    nextState.stage = Stage.REVEALING;

    nextState.playerSecondNumber = action.number;
  } else if (action.actionType == ActionType.REVEAL) {
    require(
    state.stage == Stage.REVEALING,
    "Cannot apply REVEALING on REVEALING"
    );
    nextState.stage = Stage.DONE;

    nextState.playerFirstNumber = action.playerFirstNumber;
    nextState.salt = action.salt;
  } else {
    revert("Invalid action type");
  }
  return abi.encode(nextState);
}
```

You should also take a look at `highRoller()` which takes in the deterministic “random” seed made from the submitted player numbers and outputs dice roll totals for each player.

```solidity
function highRoller(bytes32 randomness)
    public
    pure
    returns(uint8 playerFirstTotal, uint8 playerSecondTotal)
  {
    (bytes8 hash1, bytes8 hash2,
    bytes8 hash3, bytes8 hash4) = cutBytes32(randomness);
    playerFirstTotal = bytes8toDiceRoll(hash1) + bytes8toDiceRoll(hash2);
    playerSecondTotal = bytes8toDiceRoll(hash3) + bytes8toDiceRoll(hash4);
  }
```


----------

# Getting Started

----------


## Counterfactual's Truffle box


We’ll start our new Counterfactual project with the template in the Counterfactual Truffle box. After installing [Truffle](https://truffleframework.com/docs/truffle/getting-started/installation), and familiarizing yourself with how to [create a new Truffle project](https://truffleframework.com/docs/truffle/getting-started/creating-a-project), unbox the Counterfactual Truffle box:

```bash
mkdir my-project
cd my-project
truffle unbox counterfactual/truffle-box
```

In the box, you'll find `src/app.js`. In this UI template, you'll find: 

* some initialized variables ( `let web3Provider, nodeProvider;` )
* the async function `run()` which contains calls to
    * initWeb3() // initializes web3; no need to touch this
    * initContract() // use Truffle to create a Contract object, which enables dynamic fetching of the contract address and content
    * setupCF() // setup for the Counterfactual NodeProvider; no need to touch this
    * install() // **this is where we'll code the application UI**
* a call to the `run()` function

Throughout this guide, we'll be using this template as a reference for developing `app.js`.

----------

## Constants

We’ll import some [ethers.js](https://docs.ethers.io/ethers.js) [constants and utilities](https://docs.ethers.io/ethers.js/html/api-utils.html) we’ll need to write **HighRoller**:

* HashZero // the ethers.js bytes32 representation of zero
* bigNumberify // returns Big Number types from input; we’ll use these because JavaScript is, by default, not able to handle big number representations accurately
* parseEther // converts the string representation of Ether into BigNumber instance of the amount of Wei
* solidityKeccak256 // solidity hash function
* fromExtendedKey // creates an ethereum wallet-like object, [HDNode](https://docs.ethers.io/ethers.js/html/api-advanced.html) from an extended private or public key

Let's import them at the top of `app.js`:

```typescript
const { HashZero } = ethers.constants;
const { bigNumberify, parseEther, solidityKeccak256 } = ethers.utils;
const { fromExtendedKey } = ethers.utils.HDNode;

const contractAddress = '0x91907355C59BA005843E791c88aAB80b779446c9';

let web3Provider, nodeProvider;

async function run() {

  await initWeb3();
  await initContract();
  await setupCF();
  await install();
}
```


----------

## initWeb3()

Here's what you'll find in `initWeb3()`, and there's no need to change any of it.

```typescript
async function initWeb3() {
  // Modern dapp browsers...
  if (window.ethereum) {
    web3Provider = window.ethereum;
    try {
      // Request account access
      await window.ethereum.enable();
    } catch (error) {
      // User denied account access...
      console.error("User denied account access")
    }
  }
  // Legacy dapp browsers...
  else if (window.web3) {
    web3Provider = window.web3.currentProvider;
  }
  // If no injected web3 instance is detected, fall back to Ganache
  else {
    web3Provider = new Web3.providers.HttpProvider('http://localhost:8545');
  }
  web3 = new Web3(web3Provider);
}
```

----------

## initContract()

This is where you'll create a TruffleContract object corresponding to the **HighRoller.sol** solidity contract. When developing your own apps, you'll use Truffle to point to your contract as you develop it. Let's fill some of the details in now.

```typescript
async function initContract() {
  let res = await fetch('HighRollerApp.json')
  let HighRollerAppArtifact = await res.json();
  let HighRollerApp = TruffleContract(HighRollerAppArtifact);

  // Set the provider for our contract
  HighRollerApp.setProvider(web3Provider);
}
```

----------

## setupCF()

Here's what you'll find in `setupCF()`, and there's no need to change any of it. 

```typescript
async function setupCF() {
  nodeProvider = new cf.NodeProvider();
  await nodeProvider.connect();
}
```

----------


## The install() Function

This is where we begin developing **HighRoller**.

### Counterfactual's Provider and AppFactory Objects

The `install()` function will
* reset game state
* instantiate a Counterfactual `Provider`
* instantiate a Counterfactual `AppFactory` instance.

The `Provider` is our tool for listening and responding to state changes in a virtual channel: it only needs to be given the `nodeProvider`.

The `AppFactory` is how we create new virtual channels, and it needs to know:
  * the address of the contract which provides the application logic (**HighRoller.sol**)
  * the encodings for the application state and actions (to maintain the privacy of state and actions)
  * which `Provider` can listen and propose updates to state.

We'll input the contract address for **HighRoller.sol**, and fill in the details of the `Action` and `AppState` data types for the encodings.

```typescript
async function install() {
  resetGameState();
  
  const contractAddress = '0x91907355C59BA005843E791c88aAB80b779446c9';
  const actionEncoding = 'tuple(uint8 actionType, uint256 number, bytes32 actionHash)';
  const stateEncoding = 'tuple(address[2] playerAddrs, uint8 stage, bytes32 salt, bytes32 commitHash, uint256 playerFirstNumber, uint256 playerSecondNumber)'

  let cfProvider = new cf.Provider(nodeProvider);
  let appFactory = new cf.AppFactory(contractAddress, {
    actionEncoding,
    stateEncoding
  }, cfProvider);
}
```

We’ll come back to define the function `resetGameState()` once we have a better sense of what that will entail.

### The AppFactory's proposeVirtualInstall Method

The `install()` function will also call `proposeInstall(appFactory)`. This function is where we will implement `appFactory`'s `proposeInstallVirtual()` method, which will propose creating a virtual state channel with underlying application logic specified in `appFactory`'s instantiation. To propose the new virtual channel, we'll need to specify:
  * initial state for the channel
  * who is participating in the channel
  * what are the stakes (and in what currency)
  * how long before timeout
  * the intermediary

By looking at the application logic, we expect the initial game state to begin with the `playerAddrs` set and `state.STAGE` set to `Stage.PRE_GAME`. In order to obtain the addresses, we include a couple of address-collecting utility functions

```typescript
async function getUserData() {
  return (await requestDataFromPG("playground:request:user", "playground:response:user")).data.user;
}

async function getOpponentData() {
  return (await requestDataFromPG("playground:request:matchmake", "playground:response:matchmake")).data.attributes;
}

async function requestDataFromPG(requestName, responseName) {
  return await new Promise(resolve => {
    const onPGResponse = (event) => {
      if (event.data.toString().startsWith(responseName)) {
        window.removeEventListener("message", onPGResponse);

        const [, data] = event.data.split("|");
        resolve(JSON.parse(data));
      } else if (
        event.data.data &&
        typeof event.data.data.message === "string" &&
        event.data.data.message.startsWith(responseName)
      ) {
        window.removeEventListener("message", onPGResponse);

        resolve({ data: event.data.data.data });
      }
    };

    window.addEventListener("message", onPGResponse);

    if (window === window.parent) {
      // dApp not running in iFrame
      window.postMessage(
        {
          type: "PLUGIN_MESSAGE",
          data: { message: requestName }
        },
        "*"
      );
    } else {
      window.parent.postMessage(requestName, "*");
    }
  })
}

```

and collect the account information when we call the `run()` function:

```typescript
let web3Provider, nodeProvider, account;

async function run() {
  account = await getUserData();
  
  bindEvents();
  await initWeb3();
  await initContract();
  await setupCF();
  await install();
}

```

Now we're ready to describe the `initialState` and call the `proposeVirtualInstall()` method:


```typescript
async function install() {
  resetGameState();

  let cfProvider = new cf.Provider(nodeProvider);
  let appFactory = new cf.AppFactory(contractAddress, {
    actionEncoding: " ",
    stateEncoding: " "
  }, cfProvider);

  proposeInstall(appFactory);
}

...

const initialState = {
      playerAddrs: [
        deriveAddress(
          account.nodeAddress
        ),
        deriveAddress(
          nodeAddress
        )
      ],
      stage: HighRollerStage.PRE_GAME,
      salt: HashZero,
      commitHash: HashZero,
      playerFirstNumber: 0,
      playerSecondNumber: 0
    };

async function proposeInstall(appFactory) {
  const { intermediary, nodeAddress } = await getOpponentData();
  const depositAmount = '0.00001';

  await appFactory.proposeInstallVirtual({
    initialState,
    proposedToIdentifier: nodeAddress,
    asset: {
      assetType: 0 /* AssetType.ETH */
    },
    peerDeposit: parseEther(depositAmount),
    myDeposit: parseEther(depositAmount),
    timeout: 172800,
    intermediaries: [intermediary]
  });
}
```


### The Provider's on() Method

The `install()` function is also where we instruct the cfProvider to **listen** in the channel for

- successful `proposeInstallVirtual()`
- changes in state in the channel

and to react to those changes via the `Provider` method `on()`. 


```typescript
    async function install() {
      resetGameState();

      let cfProvider = new cf.Provider(nodeProvider);
      let appFactory = new cf.AppFactory(contractAddress, {
        actionEncoding: " ",
        stateEncoding: " "
      }, cfProvider);

      proposeInstall(appFactory);

      cfProvider.on('installVirtual', onInstallEvent);
      cfProvider.on('updateState', onUpdateEvent);
    }
```

When cfProvider detects `installVirtual` (when the bot accepts our `proposeInstallVirtual()`) it calls the function `onInstallEvent()`; when it detects `updateState` (updates in state in the virtual channel), it calls `onUpdateEvent()`.


----------


## Responding to installVirtual

When `cfProvider` confirms our proposed install has been accepted, we want to save the event data as an `AppInstance` object, and reveal the “Roll the dice” button for our player to use.

```typescript
let web3Provider, nodeProvider, account, currentGame;

...

async function onInstallEvent(event) {
  currentGame.appInstance = event.data.appInstance;

  revealButton();
}
```

We'll also jump back up to `run()`, call `bindEvents()`, and implement it.

```typescript
async function run() {
  
  bindEvents();
  await initWeb3();
  await initContract();
  await setupCF();
  await install();
}

...

function bindEvents() {
  document.querySelector('#rollBtn').addEventListener("click", roll);
}
```

----------

## Referencing ActionType and Stage

Before we continue, let's create a dictionary to make referencing actions and stages easier for ourselves

```typescript
const { HashZero } = ethers.constants;
const { bigNumberify, parseEther, solidityKeccak256 } = ethers.utils;
const { fromExtendedKey } = ethers.utils.HDNode;

const HighRollerAction = {
  START_GAME: 0,
  COMMIT_TO_HASH: 1,
  COMMIT_TO_NUM: 2,
  REVEAL: 3
}

const HighRollerStage = {
  PRE_GAME: 0,
  COMMITTING_HASH: 1,
  COMMITTING_NUM: 2,
  REVEALING: 3,
  DONE: 4
};
```

----------


## The takeAction() Method of appInstance

Before we implement the `roll()` function, we need to describe how we make updates to state in the virtual channel.
    
The only way to make changes to state is via the `takeAction()` method of `appInstance`, which we implement now as a global function:

```typescript
async function takeAction(params) {
  currentGame.highRollerState = (await currentGame.appInstance.takeAction(
    params
  ));
}
```

We’re ready to implement the `roll()` function. This button will do a few things:

1. It moves the game stage forward from `Stage.PRE_GAME` to `Stage.COMMITTING_HASH` by the `START_GAME` action
1. Then, since it’s still the first player’s turn, we’ll need to take the `COMMIT_TO_HASH` action, which involves
    1. Generating our player’s number
    1. Generating our player’s salt
    1. Updating `state.commitHash` (with the COMMIT_TO_HASH action) to record the hash of our number and salt
    

The `START_GAME` action only uses `ActionType`, so we include that and leave the rest as zero:

```typescript
async function roll() {
  disableButton();

  if (currentGame.highRollerState.stage === HighRollerStage.PRE_GAME) {
    await takeAction({
      number: 0,
      actionType: HighRollerAction.START_GAME,
      actionHash: HashZero
    });
  }
}
```

While the `COMMIT_TO_HASH` action uses both the `ActionType` and `actionHash`:

```typescript
async function roll() {
  disableButton();

  if (currentGame.highRollerState.stage === HighRollerStage.PRE_GAME) {
    await takeAction({
      number: 0,
      actionType: HighRollerAction.START_GAME,
      actionHash: HashZero
    });

    const playerFirstNumber = generatePlayerNumber();

    await takeAction({
      number: 0,
      actionType: HighRollerAction.COMMIT_TO_HASH,
      actionHash: solidityKeccak256(
        ["bytes32", "uint256"],
        [numberSalt, playerFirstNumber]
      )
    });
}
```

This completes the first action of the game. Now we wait for the bot to receive the state in `COMMITTING_NUM` stage and apply the `COMMIT_TO_NUM` action, taking the game state into the `REVEALING` stage and back into our player's hands.

----------

## onUpdateEvent()

Once the bot has received our state, it will `COMMIT_TO_NUM` progressing `state.Stage` into the `REVEALING` stage. Our `cfProvider` will catch the state update in the channel, and in response we need to 
  * code our player’s `REVEAL` action for the `REVEALING` stage, moving the `state.Stage` into the `DONE` stage
  * code an end for the game in the `DONE` stage.

We'll do this now with the `onUpdateEvent()` function:

```typescript
async function onUpdateEvent({ data }) {
  const highRollerState = {
    ...data.newState,
    playerFirstNumber: currentGame.playerFirstNumber
  };

  if (highRollerState.stage === HighRollerStage.REVEALING) {
    await revealDice(highRollerState);
  } else if (highRollerState.stage === HighRollerStage.DONE) {
    await completeGame(highRollerState);
  }
}
```

----------


## revealDice()

We reveal dice by taking the `REVEAL` action and submitting with it our number and salt:

```typescript
async function revealDice(highRollerState) {
  await currentGame.appInstance.takeAction({
    actionType: HighRollerAction.REVEAL,
    actionHash: numberSalt,
    number: highRollerState.playerFirstNumber.toString()
  });
}
```

----------


## completeGame()

The `completeGame()` function will do two things:
  * retrieve information about the conclusion of the game from the contract, so that this information can be presented to the user
  * proposes uninstalling the appInstance (which will also resolve any transactions, like distributing the staked ether to the player with the higher roll total).

The only way to uninstall a virtual state channel is with a call to `appInstance.uninstall()`; in order for this call to be valid, the `isStateTerminal()` function (in **HighRoller.sol**) must return `True` when applied to the current state.

We'll also build a function called `executeContract()`: it reads in a function called `highRoller()` from the `HighRollerApp` TruffleContract object, and uses this function to display the results of the game. 

```typescript
async function completeGame(highRollerState) {
  const rolls = await executeContract(
    highRollerState.playerFirstNumber,
    highRollerState.playerSecondNumber
  );

  const { myRoll, opponentRoll } = determineRolls(highRollerState, rolls);
  const gameState = determineGameState(myRoll, opponentRoll);

  updateUIState({
    myRoll,
    opponentRoll,
    gameState,
    highRollerState
  });

  await currentGame.appInstance.uninstall(currentGame.appInstance.intermediaries[0]);

  resetApp();
}


async function executeContract(
  num1,
  num2
) {
  const randomness = solidityKeccak256(["uint256"], [num1.mul(num2)]);

  // Connect to the network
  const provider = new ethers.providers.Web3Provider(web3.currentProvider);

  // We connect to the Contract using a Provider, so we will only
  // have read-only access to the Contract. We also specify the contract method.

  const abi = [
  "function highRoller(bytes32 randomness) public pure returns(uint8 playerFirstTotal, uint8 playerSecondTotal)"
];

  const contract = new ethers.Contract(contractAddress, abi, provider);

  const result = await contract.highRoller(randomness);

  return {
    playerFirstRoll: getDieNumbers(result[0]),
    playerSecondRoll: getDieNumbers(result[1])
  };
}
```

The function `getDieNumbers()` will present the user with (manufactured) dice rolls that add up to their total score.

```typescript

function getDieNumbers(totalSum) {
  // Choose result for each die.
  if (totalSum === 12) {
    return [6, 6];
  }

  if (totalSum > 2 && totalSum < 12) {
    return [Math.floor(totalSum / 2), Math.ceil(totalSum / 2)];
  }

  if (totalSum > 2 && totalSum % 2 === 0) {
    return [Math.floor(totalSum / 2) - 1, Math.ceil(totalSum / 2) + 1];
  }

  return [totalSum / 2, totalSum / 2];
}

```

----------

## Game reset

We implement the `resetGameState()` function that `install()` called earlier.

```typescript
let web3Provider, nodeProvider, account, currentGame;

...

function resetGameState() {
  currentGame = {
    highRollerState: {
      stage: HighRollerStage.PRE_GAME
    },
    salt: generateSalt()
  };
}
```

Where the `generateSalt()` function looks like

```
function generateSalt() {
  return ethers.utils.bigNumberify(ethers.utils.randomBytes(32)).toHexString();
}
```

----------

## Filling in some UI

The rest is good old UI for the game

```typescript

function updateUIState(uiState) {
  document.querySelector("#gameResult").innerHTML = announceGameState(uiState.gameState);
  document.querySelector("#yourRoll").innerHTML = `Your roll: ${uiState.myRoll[0]} + ${uiState.myRoll[1]}`;
  document.querySelector("#opponentRoll").innerHTML = `Their roll: ${uiState.opponentRoll[0]} + ${uiState.opponentRoll[1]}`;
}

function announceGameState(gameState) {
  switch (gameState) {
    case 1: return "You won!!";
    case 2: return "You lost...";
    case 3: return "You tied?";
  }
}

function hideButton() {
  document.querySelector("#loadingSection").classList.remove("hidden");
  document.querySelector("#rollSection").classList.add("hidden");
}

function revealButton() {
  document.querySelector("#loadingSection").classList.add("hidden");
  document.querySelector("#rollSection").classList.remove("hidden");
}

function disableButton() {
  document.querySelector('#rollBtn').disabled = true;
}

function enableButton() {
  document.querySelector('#rollBtn').disabled = false;
}
```
----------

## Our HTML

```html
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <!-- The above 3 meta tags *must* come first in the head; any other head content must come *after* these tags -->
    <title>High Roller</title>

    <style type="text/css" media="screen">
      .hidden {
        display: none;
      }
    </style>
  </head>
  <body>
    <h1>High Roller</h1>

    <div id="gameScreen">
      <div id="yourRoll"></div>
      <div id="opponentRoll"></div>
      <div id="gameResult"></div>
    </div>

    <div id="loadingSection">
      <div>Loading</div>
    </div>

    <div id="rollSection" class="hidden">
      <button id="rollBtn" type="button">Roll</button>
    </div>

    <script src="//high-roller-staging.counterfactual.com/assets/ethers.js"></script>
    <script src="//awesome-johnson-66964e.netlify.com/assets/cf.js"></script>
    <script src="js/web3.min.js"></script>
    <script src="js/truffle-contract.js"></script>
    <script src="js/app.js"></script>
  </body>
</html>
```

----------


## Conclusion

You've just built your first state channels dapp with the Counterfactul framework. Along the way, you learned how:
  * to set up an `AppFactory` instance with
    - application logic designated by an ethereum contract
    - appropriate encodings for `AppState` and `Action` in the channel 
    - the `Provider` instance which is enabled to interact `appFactory` instances
  * to propose a virtual state channel, or `appInstance`, to other users with `appFactory`'s `proposeVirtualInstall()` method
  * the virtual channel is funded by a ledger channel with the `Intermediary`
  * the `Provider` instance `cfProvider` listens in the channel for `virtualInstall` and `updateState`
  * we use the `appInstance`'s method `takeAction()` to modify state in the channel
  * to uninstall the virtual channel via the `appInstance`'s method `uninstall()`

You've also seen a little bit of the coding patterns for Counterfactual App solidity contracts, including the necessary data types
  * `Action`
  * `AppState`
and functions
  * `getTurnTaker()`
  * `isStateTerminal()`
  * `applyAction()`
  * `resolve()`.
