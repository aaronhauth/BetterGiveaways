import React from 'react'
import Authentication from '../../util/Authentication/Authentication'
import { WinnerComponent } from '../shared/winner';
import { ButtonComponent } from '../shared/Button/Button';
import './LiveConfigPage.scss'
import { TextInputComponent } from '../shared/textInput/textInput';
import { ExpandableContainer } from '../shared/expandableContainer/expandableContainer';
import { ExpandableContainerList } from '../shared/expandableContainerList/expandableContainerList';

export default class LiveConfigPage extends React.Component{
    
    // baseUrl = 'http://localhost:5000/giveaway';
    baseUrl = 'https://better-giveaways.herokuapp.com/giveaway';
    constructor(props) {
        super(props)
        this.Authentication = new Authentication()

        //if the extension is running on twitch or dev rig, set the shorthand here. otherwise, set to null. 
        this.twitch = window.Twitch ? window.Twitch.ext : null
        this.state = {
            config: {

            },
            finishedLoading:false,
            theme:'light',
            isGiveawayActive: false,
            winners: [],
            userList: {}
        }

        this.handleNumberOfEntries = this.handleNumberOfEntries.bind(this);
    }

    contextUpdate(context, delta) {
        if(delta.includes('theme')) {
            this.setState(()=>{
                return {theme:context.theme}
            })
        }
    }

    componentDidMount(){
        if(this.twitch){
            this.twitch.onAuthorized((auth)=>{
                this.Authentication.setToken(auth.token, auth.userId)
                this.Authentication.makeCall(`${this.baseUrl}/broadcasterQuery`, "GET")
                .then(res => res.json())
                .then(res => {
                    if (res.status == 404) {
                        this.twitch.rig.log('no active giveaways found');
                    } else {
                        this.twitch.rig.log('found a giveaway! setting the state appropriately');
                        console.log(res);
                        this.setState({
                            isGiveawayActive: res.isActive,
                            userList: res.userList,
                            winners: res.winners
                        })
                    }
                    this.twitch.rig.log(JSON.stringify(res));
                    if(!this.state.finishedLoading) {
                        // if the component hasn't finished loading (as in we've not set up after getting a token), let's set it up now.
    
                        // now we've done the setup for the component, let's set the state to true to force a rerender with the correct data.
                        this.setState(()=>{
                            return {finishedLoading:true}
                        })
                    }
                }, err => {
                    this.twitch.rig.log(JSON.stringify(err));
                    if(!this.state.finishedLoading) {
                        // if the component hasn't finished loading (as in we've not set up after getting a token), let's set it up now.
    
                        // now we've done the setup for the component, let's set the state to true to force a rerender with the correct data.
                        this.setState(()=>{
                            return {finishedLoading:true}
                        })
                    }
                })

                
                this.twitch.listen('broadcast',(target,contentType,body)=>{
                    this.twitch.rig.log(`New PubSub message!\n${target}\n${contentType}\n${body}`)
                    // now that you've got a listener, do something with the result... 
                    let eventMessage = JSON.parse(body);

                    if (eventMessage.event === 'declare-winner') {
                        if (eventMessage.winningEntry) {
                            // this.winners.push(eventMessage.winningEntry);
                            const winners = this.state.winners;
                            const userList = this.state.userList;
                            delete userList[eventMessage.winningEntry.userName];
                            console.log(this.state.winners);
                            winners.push(eventMessage.winningEntry);
                            this.setState({
                                winners: winners,
                                userList: userList
                            })
                            console.log(this.state.winners);
                        }
                    }

                    this.twitch.rig.log(eventMessage.event)
                    if (eventMessage.event === 'user-entered') {
                        this.twitch.rig.log('a user entered!')
                        const userList = {...this.state.userList};
                        if (userList[eventMessage.enteredUser]) {
                            userList[eventMessage.enteredUser] += 1;
                        } else {
                            userList[eventMessage.enteredUser] = 1;
                        }
                        this.setState({
                            userList: userList
                        });
                    }

                    if (eventMessage.event === 'giveaway-complete') {
                        this.twitch.rig.log('the giveaway is over!');
                    }


                    // do something...

                });

            });


            this.twitch.onContext((context,delta)=>{
                this.contextUpdate(context,delta)
            })
        }
    }

    componentWillUnmount() {
        if(this.twitch){
            this.twitch.unlisten('broadcast', ()=>console.log('successfully unlistened'))
        }
    }

    startGiveaway() {
        this.Authentication.makeCall(`${this.baseUrl}/startGiveaway`, "POST", null, {
            config: this.state.config
        })
        .then(() => {
            this.setState({
                isGiveawayActive: true,
                winners: [],
                userList: {}
            })
        })
    }

    cancelGiveaway() {
        this.Authentication.makeCall(`${this.baseUrl}/cancelGiveaway`, "PUT")
        .then(() => {
            this.setState({
                isGiveawayActive: false,
                winners: [],
                userList: {}
            })
        })
    }

    pickWinner() {
        this.twitch.rig.log(`${this.baseUrl}/getWinner`);
        this.Authentication.makeCall(`${this.baseUrl}/getWinner`, 'PUT')
        .then(res => {
            this.twitch.rig.log(res);
            this.twitch.rig.log('winner picked!');
        }).catch(err => {
            this.twitch.rig.log('uh ohhhh we made an oopsie...');
            this.twitch.rig.log(`error message: ${err.message}`);
        });
    }

    endGiveaway() {
        this.twitch.rig.log(`${this.baseUrl}/getWinner`);
        this.Authentication.makeCall(`${this.baseUrl}/endGiveaway`, 'PUT')
        .then(res => {
            console.log(res);
            this.twitch.rig.log('winner picked!');
            this.setState({
                isGiveawayActive: false
            });
        }).catch(err => {
            this.twitch.rig.log(`error message: ${err.message}`);
        });
    }

    handleNumberOfEntries(event) {
        console.log(event);
        let castedNumber = null;
        if (event.target.value) {

            castedNumber = Number(event.target.value);
            if (castedNumber == 'NaN') return;
            
            if (castedNumber < 0) return;
        }

        const config = {...this.state.config}
        config.maxEntryAmount = castedNumber;
        this.setState({
            config: {...config}
        });
    }
    
    render() {
        if(this.state.finishedLoading) {
            return (
                <div className={`container ${this.state.theme === 'light' ? 'light' : 'dark'}`}>

                        { !this.state.isGiveawayActive && 
                            <div>
                                <TextInputComponent placeholder='Max Entries' onChange={this.handleNumberOfEntries} theme={this.state.theme}></TextInputComponent>
                                <ButtonComponent onClick={() => this.startGiveaway()}>Start Giveaway!</ButtonComponent>
                            </div>
                        }

                        {this.state.isGiveawayActive && 
                        <div>
                            Giveaway is active!
                            <ButtonComponent disabled={Object.entries(this.state.userList)?.length == 0} onClick={() => {this.pickWinner()}}>Pick a winner</ButtonComponent>

                            {
                                this.state.winners?.length == 0 &&
                                    <ButtonComponent onClick={() => this.cancelGiveaway()}>Cancel Giveaway</ButtonComponent>
                            }
                            {
                                this.state.winners?.length > 0 &&
                                    <ButtonComponent onClick={() => this.endGiveaway()}>End Giveaway</ButtonComponent>
                            }
                            
                        </div>

                        }




                        <ExpandableContainerList  theme={this.state.theme}>

                            {!!this.state.winners?.length &&
                                // only show winners if there are actual winners?
                                <ExpandableContainer label="Winner(s)">
                                {
                                    this.state.winners.map((winner, index) => {
                                        return <div onClick={event => this.handleNameClick(event)} className={'winnerName ' + (this.state.theme === 'light' ? 'light' : 'dark')} key={index}>{winner.userName}</div>
                                    })
                                }
                                </ExpandableContainer>
                            }
                            <ExpandableContainer label="Entries">
                                {
                                    Object.entries(this.state.userList).map(([k, v]) => <div key={k}>{k}: {v}</div>)
                                }
                            </ExpandableContainer>
                        </ExpandableContainerList>
                            
  
                </div>

            )
        }else{
            return (
                <div className="LiveConfigPage">
                </div>
            )
        }

    }
}