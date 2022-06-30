import React from 'react'
import Authentication from '../../util/Authentication/Authentication'
import { ButtonComponent } from '../shared/Button/Button';
import {ExpandableContainer} from '../shared/expandableContainer/expandableContainer'; 
import { ExpandableContainerList } from '../shared/expandableContainerList/expandableContainerList';
import { WinnerComponent } from '../shared/winner';
import { useLocation } from 'react-router-dom';

import './App.scss'

export default class App extends React.Component{
    baseUrl = 'http://localhost:5000/giveaway';
    // baseUrl = 'https://better-giveaways.herokuapp.com/giveaway';

    constructor(props){
        super(props)
        this.Authentication = new Authentication()

        console.log(location.search);
        const params = new URLSearchParams(location.search);

        //if the extension is running on twitch or dev rig, set the shorthand here. otherwise, set to null. 
        this.twitch = window.Twitch ? window.Twitch.ext : null
        this.state={
            finishedLoading:false,
            theme:'light',
            mode: params.get('anchor'),
            isVisible:true,
            giveaway: {                            
                inGiveaway: false,
                giveawayActive: false,
                numberOfEntries: 0,
                totalEntries: 0,
                winners: []
            },
            isJoining: false
        };

        console.log(this.state);
    }

    contextUpdate(context, delta){
        if(delta.includes('theme')){
            this.setState(()=>{
                return {theme:context.theme}
            })
        }
    }

    visibilityChanged(isVisible){
        this.setState(()=>{
            return {
                isVisible
            }
        })
    }

    componentDidMount(){
        if(this.twitch){
            this.twitch.onAuthorized((auth)=>{
                this.Authentication.setToken(auth.token, auth.userId)

                this.Authentication.makeCall(`${this.baseUrl}/query`)
                .then(res => res.json())
                .then((res) => {
                    this.twitch.rig.log(res);
                    if(!this.state.finishedLoading) {

                        // if the component hasn't finished loading (as in we've not set up after getting a token), let's set it up now.
    
                        // now we've done the setup for the component, let's set the state to true to force a rerender with the correct data.
                        this.setState({
                            finishedLoading: true,
                        });

                        this.setState({
                            giveaway: {...res}
                        })
                    }
                })

            })

            this.twitch.listen('broadcast',(target,contentType,body)=>{
                this.twitch.rig.log(`New PubSub message!\n${target}\n${contentType}\n${body}`)
                // now that you've got a listener, do something with the result... 
                const message = JSON.parse(body);
                console.log(message);

                if (message.event === 'giveaway-start') {
                    this.twitch.rig.log(`starting a giveaway`);
                    this.setState({
                        giveaway: {                            
                            inGiveaway: false,
                            giveawayActive: true,
                            numberOfEntries: 0,
                            totalEntries: 0,
                            maxEntryAmount: message.config.maxEntryAmount
                        },
                        winners: []
                    })
                }

                if (message.event === 'giveaway-complete') {
                    this.setState({
                        giveaway: {                            
                            inGiveaway: false,
                            giveawayActive: false,
                            numberOfEntries: 0,
                            totalEntries: 0
                        }
                    })
                }

                if (message.event === 'declare-winner') {

                    // TODO: refactor into own component "winner display"
                    const winners = this.state.giveaway.winners;
                    console.log(this.state.giveaway.winners);
                    winners.push(message.winningEntry);
                    this.setState({
                        winners: winners
                    })
                    console.log(this.state.giveaway.winners);
                }

                if (message.event === 'giveaway-cancelled') {
                    this.setState({
                        giveaway: {                            
                            inGiveaway: false,
                            giveawayActive: false,
                            maxEntryAmount: null,
                            numberOfEntries: 0,
                            totalEntries: 0
                        }
                    })
                }

                if (message.event === 'announce-count') {
                    const giveaway = {...this.state.giveaway};
                    giveaway.totalEntries = message.count;

                    this.setState({
                        giveaway: giveaway
                    })
                }

                // do something...

            })

            this.twitch.onVisibilityChanged((isVisible,_c)=>{
                this.visibilityChanged(isVisible)
            })

            this.twitch.onContext((context,delta)=>{
                this.contextUpdate(context,delta)
            })
        }
    }

    componentWillUnmount(){
        if(this.twitch){
            this.twitch.unlisten('broadcast', ()=>console.log('successfully unlistened'))
        }
    }

    joinGiveaway() {
        this.twitch.rig.log('joining?');
        this.setState({isJoining: true});
        this.Authentication.makeCall(`${this.baseUrl}/join`, "POST")
        .then(res => {
            this.setState(state => {
                const giveaway = {...state.giveaway};
                giveaway.inGiveaway = true;
                giveaway.numberOfEntries += 1;
                return {giveaway: giveaway, isJoining: false};
            })
        }, err => {
            this.twitch.rig.log('error joining the giveaway')
        })
    }
    
    render() {
        const giveaway = this.state.giveaway;

        const preventFurtherEntries = giveaway.numberOfEntries >= giveaway.maxEntryAmount;
        this.twitch.rig.log(`preventFurtherEntries: ${preventFurtherEntries}`)
        this.twitch.rig.log(`giveaway.numberOfEntries: ${giveaway.numberOfEntries}`)
        this.twitch.rig.log(`giveaway.maxEntryAmount: ${giveaway.maxEntryAmount}`)


        if(this.state.finishedLoading && this.state.isVisible){
            
            const containerClasses = [];
            containerClasses.push(this.state.theme === 'light' ? 'light' : 'dark');

            return (
                <div className={`container ${containerClasses.join(' ')}`}>
                    {giveaway.giveawayActive && 
                        <div>
                            <ButtonComponent disabled={preventFurtherEntries || this.state.isJoining} onClick={() => this.joinGiveaway()}>
                                { (!preventFurtherEntries && !this.state.isJoining) &&
                                    <span>Join Giveaway</span>
                                }

                                {this.state.isJoining &&
                                    <span>Joining...</span>
                                }

                                { preventFurtherEntries &&
                                    <span>Max Entries Reached</span>
                                }
                            </ButtonComponent>
                            {this.state.giveaway.inGiveaway && <div>
                                You're in a giveaway! 
                                <div>Times you entered: {giveaway.numberOfEntries}</div>
                            </div>}
                            {!!giveaway.totalEntries && 
                                <div>
                                    Total entries in giveaway: {giveaway.totalEntries}.
                                </div>
                            }
                        </div>
                    }
                    {!giveaway.giveawayActive && <div>No Giveaways at the moment...</div>}
                    <WinnerComponent theme={this.state.theme} winners={giveaway.winners} />

                </div>
            )
        }else{
            return (
                <div className='container'>
                    <div className='lds-dual-ring'></div>
                </div>
            )
        }

    }
}