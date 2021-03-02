import Web3 from 'web3';
import BigNumber from 'bignumber.js';

declare global {
  interface Window {
    ethereum: any;
  }
}

const networks = {
  mainnet: '0x1',
  ropsten: '0x3',
  kovan: '0x2a',
  rinkeby: '0x4',
};

interface IMetamaskService {
  testnet?: 'ropsten' | 'kovan' | 'rinkeby';
  isProduction?: boolean;
}

export default class MetamaskService {
  private wallet;
  public web3Provider;
  private testnet: string;
  private isProduction: boolean;
  public walletAddress: string = '';

  constructor({ testnet, isProduction = false }: IMetamaskService) {
    this.wallet = window.ethereum;
    this.web3Provider = new Web3(this.wallet);
    this.testnet = testnet;
    this.isProduction = isProduction;

    this.wallet.on('chainChanged', (newChain: any) => {
      const chainId = localStorage.getItem('chainId');
      if (String(chainId) !== String(newChain)) {
        localStorage.setItem('chainId', newChain);
        window.location.reload();
      }
    });
    this.wallet.on('accountsChanged', (newAccounts: any) => {
      window.location.reload();
    });
  }

  eth_requestAccounts() {
    return this.wallet.request({ method: 'eth_requestAccounts' });
  }

  getAccount() {
    const usedNetwork = this.isProduction ? 'mainnet' : this.testnet;
    const usedChain = this.isProduction
      ? networks.mainnet
      : networks[this.testnet];
    const currentChain = this.wallet.chainId;

    return new Promise((resolve, reject) => {
      if (!this.wallet) {
        reject({
          errorMsg: `${usedNetwork} wallet is not injected`,
        });
      }

      if (!currentChain || currentChain === null) {
        this.wallet
          .request({ method: 'eth_chainId' })
          .then((resChain) => {
            if (resChain === usedChain) {
              this.eth_requestAccounts()
                .then((account) => {
                  this.walletAddress = account[0];
                  resolve({
                    address: account[0],
                    network: resChain,
                  });
                })
                .catch((_) => reject({ errorMsg: 'Not authorized' }));
            } else {
              reject({
                errorMsg:
                  'Please choose ' +
                  usedNetwork +
                  ' network in metamask wallet',
              });
            }
          })
          .catch((_) => reject({ errorMsg: 'Not authorized' }));
      } else {
        if (currentChain === usedChain) {
          this.eth_requestAccounts()
            .then((account) => {
              this.walletAddress = account[0];
              resolve({
                address: account[0],
                network: currentChain,
              });
            })
            .catch((_) => reject({ errorMsg: 'Not authorized' }));
        } else {
          reject({
            errorMsg:
              'Please choose ' + usedNetwork + ' network in metamask wallet.',
          });
        }
      }
    });
  }

  getContract(tokenAddress: string, abi: Array<any>) {
    return new this.web3Provider.eth.Contract(abi, tokenAddress);
  }

  getMethodInterface(abi: Array<any>, methodName: string) {
    return abi.filter((m) => {
      return m.name === methodName;
    })[0];
  }
  encodeFunctionCall(abi: any, data: Array<any>) {
    return this.web3Provider.eth.abi.encodeFunctionCall(abi, data);
  }

  async totalSupply(
    tokenAddress: string,
    abi: Array<any>,
    tokenDecimals: number,
  ) {
    const contract = this.getContract(tokenAddress, abi);
    const totalSupply = await contract.methods.totalSupply().call();

    return +new BigNumber(totalSupply)
      .dividedBy(new BigNumber(10).pow(tokenDecimals))
      .toString(10);
  }

  async checkTokenAllowance(
    tokenAddress: string,
    contract: any,
    abi: Array<any>,
    tokenDecimals: number,
    walletAddress?: string,
  ) {
    const walletAdr = walletAddress || this.walletAddress;

    try {
      let result = await contract.methods
        .allowance(walletAdr, tokenAddress)
        .call();
      const totalSupply = await this.totalSupply(
        tokenAddress,
        abi,
        tokenDecimals,
      );

      result = result ? result.toString(10) : result;
      result = result === '0' ? null : result;
      if (result && new BigNumber(result).minus(totalSupply).isPositive()) {
        return true;
      } else {
        return false;
      }
    } catch (error) {
      return false;
    }
  }

  async approveToken(
    tokenAddress: string,
    abi: Array<any>,
    tokenDecimals: number,
    walletAddress?: string,
  ) {
    try {
      const totalSupply = await this.totalSupply(
        tokenAddress,
        abi,
        tokenDecimals,
      );

      const approveMethod = this.getMethodInterface(abi, 'approve');

      const approveSignature = this.encodeFunctionCall(approveMethod, [
        tokenAddress,
        this.calcTransactionAmount(totalSupply, tokenDecimals),
      ]);

      return this.sendTransaction({
        from: walletAddress || this.walletAddress,
        to: tokenAddress,
        data: approveSignature,
      });
    } catch (error) {
      return error;
    }
  }

  calcTransactionAmount(amount: number, tokenDecimal: number) {
    return new BigNumber(amount).times(Math.pow(10, tokenDecimal)).toString(10);
  }

  createTransaction(
    abi: Array<any>,
    method: string,
    data: Array<any>,
    tokenAddress: string,
    walletAddress?: string,
    value?,
  ) {
    const transactionMethod = this.getMethodInterface(abi, method);

    const approveSignature = this.encodeFunctionCall(transactionMethod, data);

    return this.sendTransaction({
      from: walletAddress || this.walletAddress,
      to: tokenAddress,
      data: approveSignature,
      value: value ? value : '',
    });
  }

  sendTransaction(transactionConfig: any) {
    return this.wallet.request({
      method: 'eth_sendTransaction',
      params: [transactionConfig],
    });
  }
}
