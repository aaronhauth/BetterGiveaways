import React from 'react'
import { ExpandableContainer } from './expandableContainer/expandableContainer';
import './winner.scss';

export class WinnerComponent extends React.Component {
    constructor(props){
        super(props)

        this.state= {
            isExpanded: false
        };
        this.handleNameClick = this.handleNameClick.bind(this);
    }

    toggleExpansion() {
        this.setState({
            isExpanded: !this.state.isExpanded
        })
    }

    handleNameClick(event) {
        event.stopPropagation();
    }

    render() {
        const winners = this.props.winners;
        if (winners && winners.length) {
            if (winners.length === 1) {
                return <div className='box'><span>Winner: {winners[0].userName}</span></div>
            } else {
                return <ExpandableContainer theme={this.props.theme} label="Winner(s)">
                            {
                                winners.map((winner, index) => {
                                    return <div onClick={event => this.handleNameClick(event)} className={'winnerName ' + (this.props.theme === 'light' ? 'light' : 'dark')} key={index}>{winner.userName}</div>
                                })
                            }
                        </ExpandableContainer>
            }
        }
        return <span></span>
    }
}