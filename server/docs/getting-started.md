# Counterfactual Getting Started Guide

## Introduction

Counterfactual is a development framework that makes it easy to build dapps on Ethereum that take advanatge of state channels. State channels are an “off-chain” or “layer 2” technique that allow your dapp to be instant and fee-less, while still retaining the security of an on-chain application.

State channels are particularly useful for any dapp that relies on turn-based state updates between a fixed set of users that conditionally execute a transaction based on that state. For instance, a board game dapp where users take turns making moves on the board until a winner emerges and is rewarded with some money.

In this guide, we’ll build a simple game using the Counterfactual framework. The game is called High Roller: a dice game where two users stake ETH, roll two dice, and the one with the higher roll wins all of the staked money.

To streamline the guide, we’ve built a bot to automatically accept requests to play High Roller; this means you only have to code the UI for the first player (the one who proposes to play the game).

### How does Counterfactual work?

For users, Counterfactual provides a safe central wallet in Metamask for state-channel funds and for tracking state in open channels.

For developers, Counterfactual disentangles the UI of the dapp from the formal logic of the game being implemented.


### For Users

Users install the Counterfactual Metamask plugin, which creates an Ethereum account in Metamask managed by the Counterfactual Node. Funds in this account are used to fund the individual channels that players choose to open in any specific Counterfactual app.

### For Developers

The backend logic for the game is implemented by pure functions in the Solidity contract, **HighRoller.sol**. Functionality handled includes answering the following questions:

1. whose turn is it now?
2. what are the possible actions / moves a user can legally execute?
3. when is the game over?
4. what happens to the stake when the game is over?

The contract has already been written, and can be found [here](https://github.com/counterfactual/monorepo/blob/master/packages/apps/contracts/HighRollerApp.sol).

The UI and client logic for the game is implemented in **HighRoller.js**. Functionality handled includes:

1. proposing a game to another user
2. accepting a proposal from another user
3. taking an action when it is your turn
4. listening for other players to take their turns
5. leaving a game when it’s over

You will create this file and all the functionality by following this guide.

Counterfactual nodes implement the interactions between these two components

dapp UI ( HighRoller.js ) < -- 1 -- > Counterfactual Node < -- 2 -- > GameLogic (HighRoller.sol)

in three ways:

1. **Starting a channel** - When users request / agree to play a game, the UI passes the request (via connection 1) to the Counterfactual node. The node then instantiates a state channel based on the game logic described by the contract (connection 2). Any staked funds the state channel requires are drawn from the Counterfactual wallet inside metamask.

2. **State management in a channel** - In an open channel, requests to modify state are passed to the CF node (via connection 1). The node calls the pure functions of the solidity contract (via connection 2) to verify that requests to modify state are valid, and to alter the state accordingly. The node makes updated state available to members of the channel (via connection 1).

3. **Ending a game**  - When the game is over, the dapp (HighRoller.js) must request (via connection 1) that the node end the game. In turn, the CF node will (via connection 2) verify that the game is over, and if it is over, have the contract implement the transactions that resolve the game.


### In this Getting Start Guide, you’ll learn how to:

1. Instantiate a Counterfactual NodeProvider
2. Connect the NodeProvider to a blockchain contract through an AppFactory instance
3. Use the AppFactory’s `.proposeInstallVirtual()` method to propose a new virtual state channel based on the AppFactory instance’s settings (including stakes and game logic)
4. Use the NodeProvider’s `.on()`  method to listen for accepted installs and updated state in the channel
5. Use the AppInstance’s `.takeAction()` method to propose updates to state in the channel
6. Use the AppInstance’s `.uninstall()` method to propose closing and resolving the channel

----------

# HighRoller.js

## Truffle unbox


We’ll start our new Counterfactual project with the template in the Counterfactual Truffle box. After installing [Truffle](https://truffleframework.com/tutorials/pet-shop), unbox the Counterfactual Truffle box:

```bash
mkdir my-project
cd my-project
truffle unbox counterfactual/truffle-box
```

Looking through the template, you’ll find:

* some initialized variables ( `let web3Provider, nodeProvider;` )
* the async function `run()` which contains calls to
    * initWeb3() // initializes web3; already complete and explained inline
    * initContract() // **this is where we point to the blockchain contract for our state channel** - we’ll explain and fill in the details during the guide
    * setupCF() // setup for the Counterfactual NodeProvider; already complete
    * install() // **this is the game** - we’ll explain and fill this in
        * The install function will call the rest of the functions in the doc
* a call to the `run()` function

----------

## Constants

We’ll import some [ethers.js](https://docs.ethers.io/ethers.js) [constants and utilities](https://docs.ethers.io/ethers.js/html/api-utils.html) we’ll need to write High Roller:

* HashZero // the ethers.js bytes32 representation of zero
* bigNumberify // returns Big Number types from input; we’ll use these because JavaScript is, by default, not able to handle big number representations accurately
* parseEther // converts the string representation of Ether into BigNumber instance of the amount of Wei
* solidityKeccak256 // solidity hash function
* fromExtendedKey // creates an ethereum wallet-like object, [HDNode](https://docs.ethers.io/ethers.js/html/api-advanced.html) from an extended private or public key


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

This is where we point our HighRoller app to the corresponding HighRoller solidity contract.

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

We set up a Counterfactual NodeProvider.

```
async function setupCF() {
  nodeProvider = new cf.NodeProvider();
  await nodeProvider.connect();
}
```

----------


## install()

This is where we begin coding the game.

The install function will
* reset game state
* instantiate a new cfProvider
* instantiate an appFactory instance of our HighRoller contract. To do this,  we’ll need
  * the address of our contract, which we've already set up
  * the encodings for the game, which we haven't thought about yet
  * and the cfProvider


```typescript
async function install() {
  resetGameState();

  let cfProvider = new cf.Provider(nodeProvider);
  let appFactory = new cf.AppFactory(contractAddress, {
    actionEncoding: " ",
    stateEncoding: " "
  }, cfProvider);
}
```

We’ll define the function `resetGameState()` once we have a better sense of what that will entail.

The install() function will also call `proposeInstall(appFactory)`. This function will implement the appFactory's `proposeInstallVirtual()` method; it asks the Counterfactual node to instantiate a (virtual) state channel based on the blockchain contract specified in `appFactory`. To call this method, we’ll need to specify

* the initial state for the game (we’ll have to fill this in after we look at the High Roller contract)
* who is playing
* what are the stakes (and in what currency)
* how long before timeout
* the intermediary

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

async function proposeInstall(appFactory) {
  const { intermediary, nodeAddress } = await getOpponentData();
  const depositAmount = '0.00001';
  const initialState = {};

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


The install() function is also where we instruct the cfProvider to **listen** in the channel for

- successful installVirtual
- changes in state in the channel

and to react to those changes via the method  `.on(listenFor, respondWith() )`.


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

When cfProvider detects ‘installVirtual’ is successful (when the bot accepts our proposeInstallVirtual) it calls the function **onInstallEvent().** When it detects updates in state in the virtualChannel, it calls **onUpdateEvent().**  This is the in-channel state management mechanism for Interface 1.


----------


## onInstallEvent()

When the cfProvider confirms our proposed install has been accepted, we reveal the “Roll the dice” button for our player to use.

```typescript
async function onInstallEvent(event) {
  currentGame.appInstance = event.data.appInstance;

  revealButton();
}
```

We'll also jump back up to `run()` and call `bindEvents()`

```typescript
async function run() {
  
  bindEvents();
  await initWeb3();
  await initContract();
  await setupCF();
  await install();
}
```

and implement it

```typescript
function bindEvents() {
  document.querySelector('#rollBtn').addEventListener("click", roll);
}
```

Now we’ll take a quick look at the HighRoller.sol contract to see how the game logic is structured.

----------

# HighRoller.sol

TODO

----------

## Game logic for HighRoller.sol

We want to make our dice game very secure: the die rolls for both players will be determined by the contract. Each player submits a number, and the contract uses those two numbers as a distributed random-number generator to generate the die rolls we need. This only works if both players are ignorant of their opponents submission. In order to remove any advantage from the second player, we plan the structure of HighRoller

- the first player **submits a hash** of their **number** with a **salt**
- the second player **submits** their **number**
- the first player **reveals** their number (by submitting both the number and the salt, which are checked against the original hash)
- the contract generates die rolls and distributes money to the winner

The information above is enough to determine the ActionType, Stage, AppState, and Action for the game.


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

Because it’s such a simple game (player1 → player2 → player1 → done), getTurnTaker() and isStateTerminal() are both quite simple.

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

Actions for the game are defined in the applyAction function

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
    state.stage == Stage.REVEALING
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

You should also take a look at `highRoller(randomness)` which takes in the deterministic “random” seed made from the submitted player numbers and outputs the totals for each player.

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

Back to the javascript.


----------


# HighRoller.js


----------


## encoding, initial state, and resetGameState()

Now that we know what HighRoller.sol looks like, we can fill in the encoding for the game:


```typescript
async function install() {
  resetGameState();

  let cfProvider = new cf.Provider(nodeProvider);
  let appFactory = new cf.AppFactory(contractAddress, {
    actionEncoding: "tuple(uint8 actionType, uint256 number, bytes32 actionHash)",
    stateEncoding: "tuple(address[2] playerAddrs, uint8 stage, bytes32 salt, bytes32 commitHash, uint256 playerFirstNumber, uint256 playerSecondNumber)"
  }, cfProvider);

  proposeInstall(appFactory);

  cfProvider.on('installVirtual', onInstallEvent);
  cfProvider.on('updateState', onUpdateEvent);
}
```

We can also describe the initialState:

```typescript
async function proposeInstall(appFactory) {
  const { intermediary, nodeAddress } = await getOpponentData();
  const betAmount = '0.00001'; //in ETH
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
    },

  await appFactory.proposeInstallVirtual({
  initialState,
  proposedToIdentifier: nodeAddress,
  asset: {
    assetType: 0 /* AssetType.ETH */
  },
  peerDeposit: parseEther(betAmount),
  myDeposit: parseEther(betAmount),
  timeout: 172800,
  intermediaries: [intermediary]
  });
}
```

and a game reset:

```typescript
let web3Provider, nodeProvider, currentGame;

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

where the `generateSalt()` function looks like

```
function generateSalt() {
  return ethers.utils.bigNumberify(ethers.utils.randomBytes(32)).toHexString();
}
```

----------


## referencing action and stage

Since solidity uses enums, we create a dictionary to make implementing actions and referencing stages easier for ourselves

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

## roll()

Finally, we’re ready to return to rolling the dice. This button will do a few things:

1. it moves the game forward from PRE_GAME to COMMITTING_HASH by the START_GAME action
2. then, since it’s still our player’s turn, we’ll need to take the COMMIT_TO_HASH action, which involves
    1. generating our player’s number
    2. generating our player’s salt
    3. submitting to the contract (with the COMMIT_TO_HASH action) the hash of our number and salt

We’ll use the as-yet undefined takeAction function to do this, which will need data specified for each of the three data types in the Action data structure.

The START_GAME action only uses the ActionType, so we leave the rest as zero:

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

While the COMMIT_TO_HASH uses both its type and actionHash:

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

async function takeAction(params) {
  currentGame.highRollerState = (await currentGame.appInstance.takeAction(
    params
  ));
}
```

This completes the first move in the game. Now we wait for the bot to receive the state in COMMITTING_NUM stage and move it into REVEALING

----------


## onUpdateEvent()

Presumably, the bot has received our state, committed their number and moved the game into the REVEALING stage. We need to code our player’s REVEAL action for the REVEALING stage, and then we need to code for the end of the game in the DONE stage.


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

We reveal dice by taking the REVEAL action and submitting with it our number and salt

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

The completeGame() function will do two things:

- triggers the resolution of the solidity contract
- retrieve information about the conclusion of the game from the solidity contract, so that it can present this information to the user.

`executeContract()` is a UI function. we read in the contract, and apply the winning condition function (called **highRoller()** ) to the random seed we generated (playerFirstNumber * playerSecondNumber)

`appInstance.uninstall()` is a call to trigger the **resolve()** function in HighRoller.sol (which triggers any financial consequences/transactions).

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

----------

The rest is good old UI for the game.

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
